// The table's realtime link in the browser: Ably over 'ably/modular' alone — BaseRealtime with the
// WebSocket transport and fetch, no REST plugin, no presence, no fallback transport — loaded by a
// dynamic import() the first time a table with realtime connects, so the library is in no other
// page's bundle, and in /play's only as a chunk fetched on demand. The server's half is
// lib/poker-night/realtime; what the channel and its messages are is lib/poker-night/channel.
//
// The link only reports: each state message's wire view (checked to be one), each emote message
// (lib/poker-night/emotes.readEmote; useTableFeed merges it by id), each nudge on the viewer's own
// channel (their nudge count: their own view changed where no state message shows it), the connection's
// state, each time the channel (re)attaches — the moment a GET state closes any gap — and the server
// saying this table has no realtime. lib/poker-night/feed decides what they mean (useTableFeed
// applies a wire by seq, so a message out of order or twice changes nothing). Tokens come from
// GET token (TokenDetails, subscribe-only on this room's channel): the first one the link fetched
// itself, every renewal through Ably's authCallback.
//
// The QA seam: the browser QA has no Ably key, so a dev server started by scripts/qa/run.sh
// (NEXT_PUBLIC_PN_RT_FAKE=1) lets a page that defines window.__PN_RT_FAKE__ take its messages from
// that object instead (scripts/qa/qa-poker-night.mjs's relay). Both guards are needed: a production
// build compiles the seam out (NODE_ENV and the flag are inlined at build time), and without the
// object nothing changes.

import type {BaseRealtime} from "ably/modular";
import {getToken} from "@/components/poker-night/table-api";
import {EMOTE_MESSAGE, isWire, NUDGE_MESSAGE, nudgeOf, STATE_MESSAGE} from "@/lib/poker-night/channel";
import {readEmote} from "@/lib/poker-night/emotes";
import {tokenRetryDelay, tokenRetryLate, type AblyState} from "@/lib/poker-night/feed";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import type {EmoteView, RealtimeTokenView, WireView} from "@/lib/poker-night/view-types";

export type RealtimeEvents = {
    wire: (wire: WireView) => void;
    connection: (state: AblyState) => void;
    // The channel attached (or re-attached, or lost its continuity): read the table once.
    attached: () => void;
    // The server says this table has no realtime (no key, or the kill switch): poll.
    off: () => void;
    // An emote (P6), checked to be one (lib/poker-night/emotes.readEmote).
    emote?: (emote: EmoteView) => void;
    // A nudge on the viewer's own channel: their nudge count after it.
    nudge?: (count: number) => void;
};

export type RealtimeLink = {
    // Let the connection go (a page hidden for five minutes); resume opens it again.
    suspend: () => void;
    resume: () => void;
    close: () => void;
};

// ── the QA seam ──

// What the QA's relay defines on the page before it loads: subscribe hands it the link's
// callbacks and returns how to stop.
export type RealtimeFake = {
    subscribe: (handlers: {
        onState: (data: unknown) => void; onConnection: (state: string) => void; onEmote?: (data: unknown) => void; onNudge?: (data: unknown) => void;
    }) => (() => void) | void;
};

declare global {
    interface Window {
        __PN_RT_FAKE__?: RealtimeFake;
    }
}

const FAKE_ALLOWED = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_PN_RT_FAKE === '1';

// The QA's relay, when this is a QA dev server and the page defines one; null everywhere else.
export const realtimeFake = (): RealtimeFake | null => {
    if (!FAKE_ALLOWED || typeof window === 'undefined') return null;
    const fake = window.__PN_RT_FAKE__;
    return typeof fake === 'object' && fake !== null && typeof fake.subscribe === 'function' ? fake : null;
};

const ABLY_STATES: ReadonlySet<string> = new Set(['initialized', 'connecting', 'connected', 'disconnected', 'suspended', 'failed', 'closing', 'closed']);
const isAblyState = (value: unknown): value is AblyState => typeof value === 'string' && ABLY_STATES.has(value);

const connectFake = (fake: RealtimeFake, on: RealtimeEvents): RealtimeLink => {
    let stop: (() => void) | void = undefined;
    let open = false;
    const start = () => {
        if (open) return;
        open = true;
        stop = fake.subscribe({
            onState: (data) => {
                if (open && isWire(data)) on.wire(data);
            },
            onConnection: (state) => {
                if (!open || !isAblyState(state)) return;
                on.connection(state);
                if (state === 'connected') on.attached();
            },
            onEmote: (data) => {
                const emote = open ? readEmote(data) : null;
                if (emote) on.emote?.(emote);
            },
            onNudge: (data) => {
                const count = open ? nudgeOf(data) : null;
                if (count !== null) on.nudge?.(count);
            },
        });
    };
    const end = () => {
        if (!open) return;
        open = false;
        stop?.();
        stop = undefined;
    };
    start();
    return {
        suspend: () => {
            end();
            on.connection('closed');
        },
        resume: start,
        close: end,
    };
};

// ── Ably ──

// A first token that fails to come is asked for again on lib/poker-night/feed's ladder
// (tokenRetryDelay): 5, 15 and 45 s for a refusal that passes (a dropped connection, a busy room,
// the token counter), then every five minutes for as long as the link is open — never given up, so a
// table that missed its first token goes live once the route answers again. From the first long wait
// the link says 'failed' (polls run beside it); a refusal that is not passing (removed, gone, a newer
// deploy) the polls also find out about and settle. A page hidden long enough to let its connection
// go asks nothing meanwhile, and asks at once when it shows.
const TRANSIENT_TOKEN_CODES: ReadonlySet<PokerNightErrorCode> = new Set(['unavailable', 'busy', 'rate_limited']);

// The link to room `code`'s channel: the fake in a QA dev server that has one, else Ably.
export const connectRealtime = (code: string, pass: () => string | null, on: RealtimeEvents): RealtimeLink => {
    const fake = realtimeFake();
    if (fake) return connectFake(fake, on);

    let closed = false;
    let suspended = false;
    let client: BaseRealtime | null = null;
    let attach: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let opening = false; // a first token (or the library) is on its way
    let attempt = 0; // first tokens asked for again since the last one that came

    const retry = (transient: boolean) => {
        if (closed) return;
        if (tokenRetryLate(attempt, transient)) on.connection('failed');
        const wait = tokenRetryDelay(attempt, transient);
        attempt++;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            void open();
        }, wait);
    };

    const open = async (): Promise<void> => {
        // Hidden and let go: resume asks.
        if (closed || suspended || opening || client !== null) return;
        opening = true;
        try {
            await connect();
        } finally {
            opening = false;
        }
    };

    const connect = async (): Promise<void> => {
        const first = await getToken(code, {pass: pass()});
        if (closed) return;
        if (!first.ok) {
            retry(TRANSIENT_TOKEN_CODES.has(first.code));
            return;
        }
        if (!first.body.realtime) {
            on.off();
            return;
        }
        const {channel: channelName, private: ownName, token} = first.body;
        let ably: typeof import("ably/modular");
        try {
            ably = await import("ably/modular");
        } catch {
            // A chunk that would not load (a dropped connection, or a newer deploy the polls settle).
            retry(true);
            return;
        }
        if (closed) return;
        attempt = 0;

        // The token this link fetched serves the first connection; every renewal asks the route.
        let handed: RealtimeTokenView | null = token;
        const realtime = new ably.BaseRealtime({
            authCallback: (_params, callback) => {
                if (handed !== null) {
                    const details = handed;
                    handed = null;
                    callback(null, details);
                    return;
                }
                void getToken(code, {pass: pass()}).then((r) => {
                    if (r.ok && r.body.realtime) {
                        callback(null, r.body.token);
                        return;
                    }
                    if (r.ok) on.off();
                    callback(r.ok ? 'realtime is off for this table' : `token refused: ${r.code}`, null);
                });
            },
            echoMessages: false,
            autoConnect: !suspended,
            plugins: {WebSocketTransport: ably.WebSocketTransport, FetchRequest: ably.FetchRequest},
        });
        client = realtime;
        realtime.connection.on((change) => {
            if (!closed && isAblyState(change.current)) on.connection(change.current);
        });
        if (isAblyState(realtime.connection.state)) on.connection(realtime.connection.state);
        const channel = realtime.channels.get(channelName);
        channel.on(['attached', 'update'], (change) => {
            // An update that kept its continuity lost nothing.
            if (!closed && (change.current === 'attached' && (!change.resumed || change.previous !== 'attached'))) on.attached();
        });
        attach = () => void channel.attach().catch(() => undefined);
        void channel.subscribe(STATE_MESSAGE, (message) => {
            if (!closed && isWire(message.data)) on.wire(message.data);
        }).catch(() => undefined);
        void channel.subscribe(EMOTE_MESSAGE, (message) => {
            const emote = closed ? null : readEmote(message.data);
            if (emote) on.emote?.(emote);
        }).catch(() => undefined);
        // The viewer's own channel: nudges for them alone (an older server names none).
        if (typeof ownName === 'string') {
            void realtime.channels.get(ownName).subscribe(NUDGE_MESSAGE, (message) => {
                const count = closed ? null : nudgeOf(message.data);
                if (count !== null) on.nudge?.(count);
            }).catch(() => undefined);
        }
    };

    void open();

    return {
        suspend: () => {
            suspended = true;
            client?.close();
        },
        resume: () => {
            if (!suspended) return;
            suspended = false;
            if (client) {
                client.connect();
                // A close detached the channel: attach it again (queued until connected).
                attach?.();
                return;
            }
            // No connection yet (a first token still to come): ask now, not at the next retry.
            if (retryTimer !== null) clearTimeout(retryTimer);
            retryTimer = null;
            void open();
        },
        close: () => {
            closed = true;
            if (retryTimer !== null) clearTimeout(retryTimer);
            client?.close();
            client = null;
        },
    };
};
