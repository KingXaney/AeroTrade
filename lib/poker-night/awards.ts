// The night's awards (P7), shown on the end-of-night summary (lib/poker-night/summary,
// components/poker-night NightSummary): Biggest pot, Most hands won, Highest stack, Most all-ins
// from the ledger's own counters (types.LedgerRow), and Tomato magnet and Most roses given from
// the throws the emote route counted beside the game (the room's private `awards`, room-doc
// .emoteWrite). Pure and client-safe; the /play page reads both on the server and hands the
// summary only the awards it makes — names and figures, never a counter or an identity.
//
// An award shows only when its data exists: a figure above zero (and for Highest stack, a player
// dealt at least one hand, since a buy-in alone sets the peak). Ties list every name. Each award's
// picture is one Emoji 12.0 code point with no joiner, skin tone or variation selector, kept here
// as a code point (no glyph is written into a .tsx file), the throws' the same as the emote
// registry's.

import {fnv1a, mulberry32} from '@/lib/random';
import {isThrowable, REACTIONS, THROWABLES, type ThrowId} from '@/lib/poker-night/emotes';

export const AWARD_IDS = ['biggest-pot', 'most-won', 'highest-stack', 'most-all-ins', 'tomato-magnet', 'most-roses'] as const;
export type AwardId = (typeof AWARD_IDS)[number];

export const AWARD_POINTS: Readonly<Record<AwardId, number>> = {
    'biggest-pot': 0x1f3c6, // trophy
    'most-won': 0x1f31f, // glowing star
    'highest-stack': 0x1f451, // crown
    'most-all-ins': REACTIONS.fire,
    'tomato-magnet': THROWABLES.tomato.point,
    'most-roses': THROWABLES.rose.point,
};

export const awardGlyph = (id: AwardId): string => String.fromCodePoint(AWARD_POINTS[id]);

// What the ledger counts per player (types.LedgerRow's counters): a LedgerRow is one.
export type NightCounters = {pid: string; hands: number; wins: number; biggestWin: number; allIns: number; peakChips: number};

// What each player threw and caught tonight, by throwable.
export type ThrowTally = {thrown: Partial<Record<ThrowId, number>>; received: Partial<Record<ThrowId, number>>};
export type ThrowCounts = ReadonlyMap<string, ThrowTally>;

// A player's public handle (lib/poker-night/input PID), kept here so the summary's bundle carries
// no schema library.
const PID = /^[A-Za-z0-9_-]{11}$/;

const plain = (raw: unknown): raw is Record<string, unknown> =>
    typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const tally = (raw: unknown): Partial<Record<ThrowId, number>> => {
    const out: Partial<Record<ThrowId, number>> = {};
    if (!plain(raw)) return out;
    for (const [item, n] of Object.entries(raw)) {
        if (isThrowable(item) && Number.isSafeInteger(n) && (n as number) > 0) out[item] = n as number;
    }
    return out;
};

// The room's stored `awards` as counts, or none: only a pid's own entry, only a registry's
// throwable, only a whole count above zero. A document a later deploy wrote, or a broken one,
// reads as whatever of it holds.
export const throwCountsOf = (raw: unknown): ThrowCounts => {
    const out = new Map<string, ThrowTally>();
    if (!plain(raw)) return out;
    for (const [pid, entry] of Object.entries(raw)) {
        if (!PID.test(pid) || !plain(entry)) continue;
        out.set(pid, {thrown: tally(entry.thrown), received: tally(entry.received)});
    }
    return out;
};

export type AwardWinners = {id: AwardId; pids: string[]; value: number};

// The players with the highest figure above zero, in the order given; null when nobody has one.
const most = (pids: readonly string[], valueOf: (pid: string) => number): {pids: string[]; value: number} | null => {
    let value = 0;
    let winners: string[] = [];
    for (const pid of pids) {
        const v = valueOf(pid);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (v > value) {
            value = v;
            winners = [pid];
        } else if (v === value) {
            winners.push(pid);
        }
    }
    return winners.length > 0 ? {pids: winners, value} : null;
};

// The night's awards among `players` (the summary's standings, in their order, so a tie lists its
// names as the standings do), each in AWARD_IDS order and only when its data exists. A counter
// or a throw for anyone not among them — a row the night let go of — is not read.
export const nightAwards = (players: readonly string[], counters: readonly NightCounters[], throws: ThrowCounts): AwardWinners[] => {
    const rows = new Map(counters.map((row) => [row.pid, row]));
    const counter = (pick: (row: NightCounters) => number) => (pid: string): number => {
        const row = rows.get(pid);
        return row ? pick(row) : 0;
    };
    const thrown = (item: ThrowId) => (pid: string): number => throws.get(pid)?.thrown[item] ?? 0;
    const received = (item: ThrowId) => (pid: string): number => throws.get(pid)?.received[item] ?? 0;
    const figures: Record<AwardId, (pid: string) => number> = {
        'biggest-pot': counter((row) => row.biggestWin),
        'most-won': counter((row) => row.wins),
        'highest-stack': counter((row) => (row.hands > 0 ? row.peakChips : 0)),
        'most-all-ins': counter((row) => row.allIns),
        'tomato-magnet': received('tomato'),
        'most-roses': thrown('rose'),
    };
    return AWARD_IDS.flatMap((id) => {
        const top = most(players, figures[id]);
        return top ? [{id, pids: top.pids, value: top.value}] : [];
    });
};

// ── the celebration ──

// The confetti the summary throws as it opens: the same pieces for the same table on every
// screen, from its code. Offsets in px from the burst's centre, a turn in degrees and a wait in
// ms; the component picks each piece's colour from the palette by its index.
export const CELEBRATION = {pieces: 32, spreadX: 260, rise: 150, fall: 190, turn: 540, waitMs: 260} as const;

export type CelebrationBit = {key: number; x: number; y: number; rot: number; wait: number};

export const celebrationBits = (seed: string): CelebrationBit[] => {
    const random = mulberry32(fnv1a(`poker-night:wrap:${seed}`));
    return Array.from({length: CELEBRATION.pieces}, (_, key) => ({
        key,
        x: Math.round((random() * 2 - 1) * CELEBRATION.spreadX),
        y: Math.round(-CELEBRATION.rise + random() * (CELEBRATION.rise + CELEBRATION.fall)),
        rot: Math.round((random() * 2 - 1) * CELEBRATION.turn),
        wait: Math.round(random() * CELEBRATION.waitMs),
    }));
};
