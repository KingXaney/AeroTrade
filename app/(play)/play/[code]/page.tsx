import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import NightSummary from "@/components/poker-night/NightSummary";
import PokerNightRoom from "@/components/poker-night/PokerNightRoom";
import {INVITE_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {avatarForUser, encodeAvatar, rollAvatar} from "@/lib/poker-night/avatar";
import {normalizeCode} from "@/lib/poker-night/code";
import {envOf} from "@/lib/poker-night/env";
import {readIdentity, type PlayerIdentity} from "@/lib/poker-night/identity";
import {originFromHeaders, shareUrlFor} from "@/lib/poker-night/links";
import {profileOf} from "@/lib/poker-night/lobby";
import {passFor, passKey} from "@/lib/poker-night/pass";
import {getPokerNightPrefs} from "@/lib/poker-night/prefs-store";
import {playerFor, playPageView, roomView} from "@/lib/poker-night/room";
import {getRoomByCodeCached, type ServerRoom} from "@/lib/poker-night/store";
import {summarize} from "@/lib/poker-night/summary";
import type {PlayPageView} from "@/lib/poker-night/view-types";

// A poker night table, /play/CODE: open to anyone with the link. The code arrives canonical, and the
// room known to exist (the segment's layout redirects a lower-case or spaced code and answers 404 for
// one that is not a code or names no table, before anything streams), then the identity and the room
// are read together (the room through the request's cache, already read by the layout). A closed
// table shows the night's summary; an open one renders the room — the viewer's own view once they
// have joined, else the public table behind the join card. Never writes: a link preview or a
// prefetch cannot move the table
// (lib/poker-night/__tests__/route-guard.test.ts). Every time comes from the store's read, never
// the render's clock.

type Props = {
    params: Promise<{code: string}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const codeFrom = (raw: string): string | null => {
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        // A malformed escape reads as typed.
    }
    return normalizeCode(decoded);
};

// The room, or the page's answer when there is none: a 404 when it is gone or expired; an error
// (error.tsx) when its state cannot be read here.
const roomFor = async (code: string): Promise<ServerRoom> => {
    const read = await getRoomByCodeCached(envOf(), code);
    if (read.ok) return read.room;
    if (read.why === 'gone') notFound();
    throw new Error(read.why === 'newer' ? 'poker night: this table was written by a newer deploy' : 'poker night: this table could not be read');
};

// A joined viewer's seat pass, minted from the read's own time so their first poll skips the
// session read; none when no key can be derived.
const seatPass = (roomId: string, pid: string, at: number): string | null => {
    try {
        return passFor(passKey(), roomId, pid, at);
    } catch {
        return null;
    }
};

// A guest's first look: the one their guest cookie rolls, else a fresh one (the browser keeps it).
const freshLook = (identity: PlayerIdentity): string =>
    encodeAvatar(identity.kind === 'guest' ? avatarForUser(identity.guestId) : rollAvatar(Math.random));

// POKER_NIGHT_POLL_MS: a floor on every poll's wait (ms), none by default.
const pollFloor = (raw: string | undefined): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 60_000) : 0;
};

export const generateMetadata = async ({params}: Props): Promise<Metadata> => {
    const code = codeFrom((await params).code);
    if (!code) return {title: TABLE_COPY.notFoundTitle};
    try {
        const read = await getRoomByCodeCached(envOf(), code);
        if (!read.ok) return {title: TABLE_COPY.notFoundTitle};
        return {title: TABLE_COPY.name(read.room.core.state.settings.name, code), description: INVITE_COPY.ogDescription};
    } catch {
        return {title: TABLE_COPY.name('', code)};
    }
};

const PlayPage = async ({params, searchParams}: Props) => {
    const [{code: raw}, query] = await Promise.all([params, searchParams]);
    const code = codeFrom(raw);
    if (!code) notFound();

    const env = envOf();
    const [identity, room, headerList] = await Promise.all([readIdentity(env), roomFor(code), headers()]);
    if (identity.kind === 'unavailable') throw new Error('poker night: the session could not be read');
    const signedIn = identity.kind === 'user';
    const core = room.core;

    if (core.state.status === 'closed') {
        const summary = summarize({
            view: roomView(core, room.seq, room.readAt, {realtimeOk: room.realtimeOk}),
            startedAt: core.state.createdAt,
            endedAt: room.closedAt ?? room.lastActivityAt,
            me: playerFor(core, identity)?.pid ?? null,
        });
        return <NightSummary summary={summary} signedIn={signedIn}/>;
    }

    const page = playPageView(core, identity, room.seq, room.readAt, {realtimeOk: room.realtimeOk, emotes: room.emotes, emoteSeq: room.emoteSeq, pass: null});
    const initial: PlayPageView = 'view' in page ? {view: {...page.view, pass: seatPass(core.id, page.view.me.pid, room.readAt)}} : page;
    const suggested = identity.kind === 'user'
        ? profileOf(await getPokerNightPrefs(identity.userId), identity.accountName, identity.userId)
        : {name: '', avatar: freshLook(identity)};

    // A viewer who joins, is removed or is let back in is a different room on the client.
    return (
        <PokerNightRoom
            key={'view' in initial ? `player:${initial.view.me.pid}` : `visitor:${initial.join.banned ? 'removed' : 'open'}`}
            code={code}
            shareUrl={shareUrlFor(code, {env, requestOrigin: originFromHeaders(headerList)})}
            initial={initial}
            config={core.state.config}
            suggested={{name: suggested.name, avatar: suggested.avatar}}
            signedIn={signedIn}
            invite={query.invite === '1'}
            pollScale={pollFloor(process.env.POKER_NIGHT_POLL_MS)}
        />
    );
};

export default PlayPage;
