// Emotes at a poker night table: thirteen reactions that rise over the sender's plate, sixteen
// phrases said in a bubble, and ten things to throw at another player, each landing with its own
// impact (a splat, petals, fizz, a burst, a bounce). The registries, the request a client sends and
// the message every client receives, the checks the route runs, and the rules the table draws them
// by — how long each kind stays, how many fit on screen, what is too old to show. Pure and
// client-safe: the route (app/api/poker-night/[code]/emote) and the table (components/poker-night
// EmoteLayer, EmotePicker, SeatMenu) read the same lists.
//
// Every glyph is one code point from Emoji 12.0 or earlier with no zero-width joiner, skin tone or
// variation selector, so every platform draws one picture; they are kept here as code points and no
// glyph is written into a .tsx file. The words for each id are lib/learn/copy/poker-night's
// EMOTE_COPY, keyed by the same ids. There is no free text: a phrase is an id, never a sentence a
// player typed.
//
// The impacts' colours (a tomato's red, an egg's yolk) are literals here, rendered into EMOTE_CSS as
// [data-splat="tomato"] blocks the (play) layout injects beside LOOKS_CSS: the DOM carries the id.

import {fnv1a, mulberry32} from '@/lib/random';
import type {PokerNightErrorCode} from '@/lib/poker-night/http';
import {LIMITS} from '@/lib/poker-night/limits';
import type {SoundId} from '@/lib/poker-night/sounds';
import {AVATAR_PX, CARD_RATIO, SHOWN_CARD_PX, TABLE_TOP_ROOM, type Fit, type SeatPlace, type Stage} from '@/lib/poker-night/stage';

// ── the registries ──

export const REACTIONS = {
    laugh: 0x1f602, wow: 0x1f62e, cool: 0x1f60e, fire: 0x1f525, clap: 0x1f44f, cry: 0x1f62d,
    think: 0x1f914, grimace: 0x1f62c, peek: 0x1f648, party: 0x1f973, huff: 0x1f624, mad: 0x1f621, sleepy: 0x1f634,
} as const;

export type ReactionId = keyof typeof REACTIONS;
export const REACTION_IDS = Object.keys(REACTIONS) as ReactionId[];

export const PHRASE_IDS = [
    'hi', 'good-luck', 'nice-hand', 'well-played', 'unlucky', 'so-close', 'wow', 'think',
    'your-move', 'bluff', 'ship-it', 'brb', 'one-more', 'thanks', 'gg', 'good-night',
] as const;

export type PhraseId = (typeof PHRASE_IDS)[number];

export const IMPACT_KINDS = ['splat', 'petals', 'fizz', 'burst', 'bounce'] as const;
export type ImpactKind = (typeof IMPACT_KINDS)[number];

// The tennis ball stands where a snowball would, which needs a variation selector.
export const THROWABLES = {
    tomato: {point: 0x1f345, impact: 'splat'},
    rose: {point: 0x1f339, impact: 'petals'},
    soda: {point: 0x1f964, impact: 'fizz'},
    confetti: {point: 0x1f389, impact: 'burst'},
    cake: {point: 0x1f370, impact: 'splat'},
    egg: {point: 0x1f95a, impact: 'splat'},
    'tennis-ball': {point: 0x1f3be, impact: 'bounce'},
    popcorn: {point: 0x1f37f, impact: 'burst'},
    heart: {point: 0x1f496, impact: 'petals'},
    fish: {point: 0x1f41f, impact: 'bounce'},
} as const satisfies Record<string, {point: number; impact: ImpactKind}>;

export type ThrowId = keyof typeof THROWABLES;
export const THROW_IDS = Object.keys(THROWABLES) as ThrowId[];

const has = <T extends object>(registry: T, id: unknown): id is keyof T =>
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(registry, id);

export const isReaction = (id: unknown): id is ReactionId => has(REACTIONS, id);
export const isPhrase = (id: unknown): id is PhraseId => typeof id === 'string' && (PHRASE_IDS as readonly string[]).includes(id);
export const isThrowable = (id: unknown): id is ThrowId => has(THROWABLES, id);

export const reactionGlyph = (id: ReactionId): string => String.fromCodePoint(REACTIONS[id]);
export const throwGlyph = (id: ThrowId): string => String.fromCodePoint(THROWABLES[id].point);
export const impactOf = (id: ThrowId): ImpactKind => THROWABLES[id].impact;

// What a landing sounds like (lib/poker-night/sounds): a wet thud only for a splat; a rose or a
// heart lands with a soft pop, as does confetti or popcorn; a soda fizzes; a ball or a fish bounces.
const LANDING_SOUNDS: Record<ImpactKind, SoundId> = {splat: 'splat', petals: 'pop', burst: 'pop', fizz: 'fizz', bounce: 'bounce'};
export const landingSound = (id: ThrowId): SoundId => LANDING_SOUNDS[impactOf(id)];

// ── what a client sends, and what everyone receives ──

export type EmoteInput = {kind: 'react'; item: ReactionId} | {kind: 'say'; item: PhraseId} | {kind: 'throw'; item: ThrowId; to: string};

// As the room stores it and every client gets it: the input, its id, its place in the room's emote
// order (seq), who sent it and when (server time).
export type EmoteMessage = EmoteInput & {id: string; seq: number; from: string; at: number};
// The same before the room's write gives it its seq.
export type EmoteDraft = EmoteInput & {id: string; from: string; at: number};

// A player's public handle (lib/poker-night/input PID): 11 characters of base64url.
const PID = /^[A-Za-z0-9_-]{11}$/;
// An emote's id, made by the server (room.newPid's shape), or any short id of the same alphabet.
const EMOTE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const keysAre = (value: object, keys: readonly string[]): boolean => {
    const own = Object.keys(value);
    return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(value, k));
};

const plain = (raw: unknown): raw is Record<string, unknown> =>
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) && Object.getPrototypeOf(raw) === Object.prototype;

// A request's body as an emote, or null: exactly these keys, ids from the registries, a pid to throw
// at. Anything more (a free-text item, an extra key, a target on a reaction) is no emote at all.
export const parseEmote = (raw: unknown): EmoteInput | null => {
    if (!plain(raw)) return null;
    switch (raw.kind) {
        case 'react':
            return keysAre(raw, ['kind', 'item']) && isReaction(raw.item) ? {kind: 'react', item: raw.item} : null;
        case 'say':
            return keysAre(raw, ['kind', 'item']) && isPhrase(raw.item) ? {kind: 'say', item: raw.item} : null;
        case 'throw':
            return keysAre(raw, ['kind', 'item', 'to']) && isThrowable(raw.item) && typeof raw.to === 'string' && PID.test(raw.to)
                ? {kind: 'throw', item: raw.item, to: raw.to} : null;
        default:
            return null;
    }
};

// A message off the channel or out of a response, as an emote the table can draw, or null. Only the
// server publishes, so this guards against a malformed message (or an id from a later deploy), not a
// forged one.
export const readEmote = (raw: unknown): EmoteMessage | null => {
    if (!plain(raw)) return null;
    const {id, seq, from, at, ...rest} = raw;
    if (typeof id !== 'string' || !EMOTE_ID.test(id) || !Number.isSafeInteger(seq) || (seq as number) < 1) return null;
    if (typeof from !== 'string' || !PID.test(from) || typeof at !== 'number' || !Number.isFinite(at)) return null;
    const input = parseEmote(rest);
    return input ? {...input, id, seq: seq as number, from, at} : null;
};

// The emote as a response or a message carries it, copied field by field.
export const emoteOut = (e: EmoteMessage): EmoteMessage =>
    e.kind === 'throw'
        ? {kind: 'throw', item: e.item, to: e.to, id: e.id, seq: e.seq, from: e.from, at: e.at}
        : e.kind === 'react' ? {kind: 'react', item: e.item, id: e.id, seq: e.seq, from: e.from, at: e.at}
            : {kind: 'say', item: e.item, id: e.id, seq: e.seq, from: e.from, at: e.at};

// ── who may send what ──

export type EmoteVerdict = 'ok' | 'not-seated' | 'throwables-off' | 'no-target' | 'self-target';

export type EmoteContext = {
    from: string; // the sender's pid
    seated: ReadonlySet<string>; // the pids in a seat now
    throwables: boolean; // the host's setting
};

// Whether `e` may go: only a seated player sends (no watcher emotes); a throw needs the host's
// throwables on, someone else, and that someone in a seat.
export const checkEmote = (e: EmoteInput, ctx: EmoteContext): EmoteVerdict => {
    if (!ctx.seated.has(ctx.from)) return 'not-seated';
    if (e.kind !== 'throw') return 'ok';
    if (!ctx.throwables) return 'throwables-off';
    if (e.to === ctx.from) return 'self-target';
    return ctx.seated.has(e.to) ? 'ok' : 'no-target';
};

// What the route answers for each refusal.
export const EMOTE_REFUSALS: Record<Exclude<EmoteVerdict, 'ok'>, PokerNightErrorCode> = {
    'not-seated': 'not_seated',
    'throwables-off': 'forbidden',
    'no-target': 'invalid_action',
    'self-target': 'invalid_action',
};

// ── the room's write (store.pushEmote) ──

// One emote per player per this long: the room's own stamp (emoteAt.<pid>) is the guard, so no
// counter is written. The picker greys out for as long.
export const EMOTE_COOLDOWN_MS = LIMITS.emoteCooldownMs;

// The night summary's counts: who threw what, and who caught it.
export const awardPaths = (from: string, to: string, item: ThrowId): {thrown: string; received: string} =>
    ({thrown: `awards.${from}.thrown.${item}`, received: `awards.${to}.received.${item}`});

// ── drawing them ──

// How many are on screen at once: per player (the oldest of theirs goes first) and in all.
export const ON_SCREEN_CAP = {perSeat: 3, total: 24} as const;

// How long each part stays, in ms — element lifetimes run on JS timers, never animationend, which a
// stopped animation (a motion guard) never fires. staleMs: an emote that reaches a page later than
// this after it was sent (a tab that slept) is not drawn.
export const EMOTE_TIMING = {burstMs: 1800, phraseMs: 3200, flightMs: 750, impactMs: 2400, staleMs: 8000} as const;

export type ShowContext = {
    me: string | null; // the viewer's pid
    muteAll: boolean; // the viewer muted every emote (their personal setting)
    muted: ReadonlySet<string>; // players the viewer muted for this session
    now: number; // server time
};

// Whether the viewer sees `e`: their own always; anyone else's unless muted (all, or that player);
// a throw at the viewer from a muted player is muted too. Never one older than staleMs.
export const emoteShows = (e: Pick<EmoteMessage, 'from' | 'at'>, ctx: ShowContext): boolean => {
    if (ctx.now - e.at > EMOTE_TIMING.staleMs) return false;
    if (ctx.me !== null && e.from === ctx.me) return true;
    return !ctx.muteAll && !ctx.muted.has(e.from);
};

// One thing on screen: a reaction rising, a phrase's bubble, a throw in flight or its impact. anchor:
// the pid it sits over (the sender, or a throw's target once it lands).
export type LiveEmote = {
    key: string;
    emote: EmoteMessage;
    phase: 'burst' | 'phrase' | 'flight' | 'impact';
    anchor: string;
    until: number; // browser time it is taken away (or, in flight, lands)
};

// What a new emote puts on screen at `now` (browser time): a throw starts in flight unless motion is
// reduced, when only its impact shows.
export const liveFor = (e: EmoteMessage, now: number, reduced: boolean): LiveEmote => {
    switch (e.kind) {
        case 'react':
            return {key: e.id, emote: e, phase: 'burst', anchor: e.from, until: now + EMOTE_TIMING.burstMs};
        case 'say':
            return {key: e.id, emote: e, phase: 'phrase', anchor: e.from, until: now + EMOTE_TIMING.phraseMs};
        case 'throw':
            return reduced
                ? {key: e.id, emote: e, phase: 'impact', anchor: e.to, until: now + EMOTE_TIMING.impactMs}
                : {key: e.id, emote: e, phase: 'flight', anchor: e.to, until: now + EMOTE_TIMING.flightMs};
    }
};

// A throw that has landed: its impact, for impactMs.
export const landed = (live: LiveEmote, now: number): LiveEmote => ({...live, phase: 'impact', until: now + EMOTE_TIMING.impactMs});

// Whether `next` takes `i`'s place on screen: a player's new phrase replaces their bubble, and a new
// impact the one already on that plate — so a player pelted every 1.2 s carries one splat at a time.
const replaces = (next: LiveEmote, i: LiveEmote): boolean =>
    i.anchor === next.anchor && ((next.phase === 'phrase' && i.phase === 'phrase') || (next.phase === 'impact' && i.phase === 'impact'));

// The list with `next` added, oldest first: whatever it replaces goes (replaces), then the oldest go
// until each player has at most perSeat and the screen at most total.
export const admit = (items: readonly LiveEmote[], next: LiveEmote, cap: typeof ON_SCREEN_CAP = ON_SCREEN_CAP): LiveEmote[] => {
    let out = items.filter((i) => i.key !== next.key && !replaces(next, i));
    out = [...out, next];
    const perAnchor = new Map<string, number>();
    for (const i of out) perAnchor.set(i.anchor, (perAnchor.get(i.anchor) ?? 0) + 1);
    out = out.filter((i) => {
        const left = perAnchor.get(i.anchor)!;
        if (left > cap.perSeat) {
            perAnchor.set(i.anchor, left - 1);
            return false;
        }
        return true;
    });
    return out.slice(-cap.total);
};

// At most one impact per plate: the one that landed last (every impact lasts impactMs, so the
// latest `until`; on a tie, the later in the list).
const oneImpactEach = (items: LiveEmote[]): LiveEmote[] => {
    const last = new Map<string, LiveEmote>();
    for (const i of items) if (i.phase === 'impact' && (last.get(i.anchor)?.until ?? -Infinity) <= i.until) last.set(i.anchor, i);
    return items.filter((i) => i.phase !== 'impact' || last.get(i.anchor) === i);
};

// What is still on screen at `now`: flights past their time land — taking the place of an impact
// already on that plate — and everything else past its time goes.
export const settle = (items: readonly LiveEmote[], now: number): LiveEmote[] => {
    let changed = false;
    const out: LiveEmote[] = [];
    for (const i of items) {
        if (i.until > now) out.push(i);
        else if (i.phase === 'flight') out.push(landed(i, now));
        if (i.until <= now) changed = true;
    }
    return changed ? oneImpactEach(out) : (items as LiveEmote[]);
};

// The soonest moment something on screen changes, or null.
export const nextChange = (items: readonly LiveEmote[]): number | null =>
    items.length === 0 ? null : Math.min(...items.map((i) => i.until));

// A reaction's sideways nudge, from its id (−14..14 px), so two at once do not sit on each other.
export const burstJitter = (id: string): number => (fnv1a(id) % 29) - 14;

export type Point = {x: number; y: number};

// The lowest a throw's arc goes: even between two seats along the top it still lifts.
export const MIN_ARC = 20;

// A throw's path, from the sender's avatar to the target's: the element sits at the target and
// starts offset by (dx, dy); arc is how far above the higher end it rises at its peak (px) — 0.35 of
// the distance, 40 to 160. `ceiling` is the highest the thrown thing's middle may go (the table's
// own coordinates): the arc is cut to stay under it, never below MIN_ARC, so a throw at a seat
// along the top never flies up behind the top bar.
export const throwPath = (from: Point, to: Point, ceiling = -Infinity): {dx: number; dy: number; arc: number} => {
    const dx = Math.round(from.x - to.x);
    const dy = Math.round(from.y - to.y);
    const free = Math.min(160, Math.max(40, Math.hypot(dx, dy) * 0.35));
    const arc = Math.round(Math.max(MIN_ARC, Math.min(free, Math.min(from.y, to.y) - ceiling)));
    return {dx, dy, arc};
};

// ── where they sit by a plate ──

// The sizes app/globals.css draws them at, per fit: a reaction's glyph (.pn-emote, max(26px,
// --pn-av × 1.1)) and how far it travels (pn-emote-rise: up 60 px over a plate, down 24 px under
// one); a thrown thing (.pn-throw-y, max(24px, --pn-av)); a phrase's bubble with its tail; the
// action tag (.pn-tag) and the status flag (.pn-plate-flag) where they overhang a plate; the gap kept.
export const EMOTE_SIZES = {rise: 60, riseBelow: 24, bubble: 30, tag: 18, flag: 9, gap: 6} as const;
export const reactionPx = (fit: Fit): number => Math.max(26, AVATAR_PX[fit] * 1.1);
export const throwPx = (fit: Fit): number => Math.max(24, AVATAR_PX[fit]);

// A seat's turned-up cards: their height, and how far off the plate they sit (.pn-seat-shown: 3 px
// over a bottom or side plate, 10 px under a top one).
const shownHeight = (fit: Fit): number => SHOWN_CARD_PX[fit] * CARD_RATIO;
const SHOWN_OFF = {over: 3, under: 10} as const;

export type EmoteSpot = {x: number; y: number; below: boolean};

// The highest anything thrown or said may reach (table coordinates): the table's own room over its
// top edge, under which the top bar ends.
export const emoteCeiling = (fit: Fit): number => -TABLE_TOP_ROOM[fit];

// The ceiling throwPath takes: the highest a thrown thing's middle may go, half its glyph and a
// little under emoteCeiling.
export const throwCeiling = (fit: Fit): number => emoteCeiling(fit) + throwPx(fit) / 2 + 2;

// Where a seat's reaction and phrase start: over the plate (y is then their bottom edge), clear of
// what the plate carries on top — its turned-up cards, the action tag (which hangs under a plate
// whose bet line sits over it, data-over) — or, for a seat along the top and any seat whose reaction
// would rise past emoteCeiling, under the plate (y their top edge), clear of the cards, the tag and
// the status flag there. `shown`: the seat's cards are turned up beside its plate.
export const emoteSpot = (place: Pick<SeatPlace, 'plate' | 'bet' | 'spot'>, stage: Pick<Stage, 'plateSize' | 'fit'>, shown: boolean): EmoteSpot => {
    const half = stage.plateSize.h / 2;
    const top = place.spot.side === 'top';
    const tagUnder = place.bet.y < place.plate.y - half;
    const cards = shownHeight(stage.fit);
    const over = Math.max(shown && !top ? SHOWN_OFF.over + cards : 0, tagUnder ? 0 : EMOTE_SIZES.tag);
    const under = Math.max(EMOTE_SIZES.flag, shown && top ? SHOWN_OFF.under + cards : 0, tagUnder ? SHOWN_OFF.under + EMOTE_SIZES.tag : 0);
    const above = place.plate.y - half - over - EMOTE_SIZES.gap;
    const fits = above - EMOTE_SIZES.rise - reactionPx(stage.fit) >= emoteCeiling(stage.fit);
    if (!top && fits) return {x: place.plate.x, y: Math.round(above), below: false};
    return {x: place.plate.x, y: Math.round(place.plate.y + half + under + EMOTE_SIZES.gap), below: true};
};

// The pieces an impact scatters (petals, a burst, fizz), the same on every screen for the same
// emote: where each ends (px from the plate's centre), how far it turns and how late it starts.
export type ImpactBit = {x: number; y: number; rot: number; delay: number};

const BITS: Record<ImpactKind, number> = {splat: 5, petals: 7, fizz: 8, burst: 10, bounce: 0};

export const impactBits = (id: string, impact: ImpactKind): ImpactBit[] => {
    const random = mulberry32(fnv1a(`${id}:${impact}`));
    const n = BITS[impact];
    return Array.from({length: n}, (_, k) => {
        const angle = (k / n) * Math.PI * 2 + random() * 0.6;
        const reach = impact === 'burst' ? 34 + random() * 26 : impact === 'splat' ? 12 + random() * 10 : 20 + random() * 16;
        // Petals drift down, fizz rises, a burst and a splat spread every way.
        const x = Math.round(Math.cos(angle) * reach);
        const y = impact === 'petals' ? Math.round(Math.abs(Math.sin(angle)) * reach * 0.6 + 14)
            : impact === 'fizz' ? -Math.round(18 + random() * 30)
                : Math.round(Math.sin(angle) * reach);
        const rot = Math.round((random() * 2 - 1) * 200);
        const delay = Math.round(random() * (impact === 'fizz' ? 420 : 160));
        return {x: impact === 'fizz' ? Math.round((random() * 2 - 1) * 18) : x, y, rot, delay};
    });
};

// ── the impacts' colours ──

export type Hex = `#${string}`;
// main: the splash or the pieces; light: its highlight (a splat's rim, every other piece).
export type ImpactColours = {main: Hex; light: Hex};

export const IMPACT_COLOURS = {
    tomato: {main: '#d7301f', light: '#ff7b5c'},
    rose: {main: '#d81b4c', light: '#ff8fab'},
    soda: {main: '#9fdcff', light: '#ffffff'},
    confetti: {main: '#ffc531', light: '#3fb7ff'},
    cake: {main: '#f6dcb0', light: '#f49ac1'},
    egg: {main: '#f5b921', light: '#fff6dc'},
    'tennis-ball': {main: '#cde23a', light: '#ffffff'},
    popcorn: {main: '#fff3cf', light: '#f2b84b'},
    heart: {main: '#f0429a', light: '#ffc2e0'},
    fish: {main: '#6cc4ea', light: '#e6f7ff'},
} as const satisfies Record<ThrowId, ImpactColours>;

// Data-attribute blocks only, literal values only (no url(), no expression, no '<'), the way
// lib/poker-night/looks builds LOOKS_CSS; the (play) layout renders this constant.
export const buildEmoteCss = (): string =>
    THROW_IDS.map((id) => `[data-splat="${id}"]{--pn-splat:${IMPACT_COLOURS[id].main};--pn-splat-light:${IMPACT_COLOURS[id].light}}`).join('\n');

export const EMOTE_CSS = buildEmoteCss();
