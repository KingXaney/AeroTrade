// Poker night's numbers: the state version, the limits a host chooses within, the defaults, the
// clock, how much of each list the state keeps, and the zod schemas that hold a config or a room's
// settings to them. Pure and client-safe — the host drawer validates with the same schemas.

import {z} from 'zod';
import type {GameConfig, RoomSettings} from '@/lib/poker-night/types';

// A stored state field never changes meaning without bumping this and adding a migration
// (lib/poker-night/migrate.ts).
export const STATE_VERSION = 1;

// Index orders the stored log and ledger tuples rely on: append only, never reorder.
export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export const ENTRY_KINDS = ['ante', 'small-blind', 'big-blind', 'post', 'fold', 'check', 'call', 'bet', 'raise', 'refund', 'show', 'void'] as const;
export const LEDGER_KINDS = ['buy-in', 'rebuy', 'top-up', 'cash-out', 'removed'] as const;
export const ENTRY_FLAGS = {allIn: 1, timeout: 2, auto: 4} as const;

// The looks the host picks for everyone; their colours live in lib/poker-night/looks.ts.
export const SCENE_IDS = ['casino-classic', 'midnight-lounge', 'neon-city', 'beach-sunset', 'deep-space', 'log-cabin', 'garden-party', 'my-theme'] as const;
export const FELT_IDS = ['emerald', 'royal-blue', 'burgundy', 'charcoal', 'violet', 'teal', 'tangerine', 'rose'] as const;

export const TABLE_LIMITS = {
    seats: {min: 2, max: 9},
    smallBlind: {min: 1},
    bigBlind: {max: 100_000},
    // The buy-in sits between one big blind and min(500 big blinds, 10 million).
    buyIn: {bigBlinds: 500, max: 10_000_000},
    turnSeconds: {min: 15, max: 120},
    pauseSeconds: {min: 3, max: 15},
    sitOutAfter: {min: 1, max: 5},
    maxRebuys: {min: 1, max: 20},
    tableName: 40,
} as const;

export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
    seats: 8, smallBlind: 10, bigBlind: 20, ante: 0, buyInMin: 2000, buyInMax: 2000,
    rebuys: 'auto', maxRebuys: null, turnSeconds: 30, pauseSeconds: 5, sitOutAfter: 2,
});

export const DEFAULT_SETTINGS: Readonly<RoomSettings> = Object.freeze({
    name: '', scene: 'casino-classic', felt: 'emerald', throwables: true, locked: false, showToFriends: false,
});

const HOUR = 3_600_000;

export const TIMING = {
    TURN_GRACE_MS: 2000, // a move may arrive this long after the deadline the UI counts down to
    TIMEOUT_SLACK_MS: 1000, // and any request but the actor's waits this much longer to time the turn out (clock.dueFor)
    RUNOUT_STEP_MS: 1500, // between the streets of an all-in run-out
    START_DELAY_MS: 3000, // from Deal (or resume, or a second player) to the cards
    MAX_CLOCK_STEPS: 8,
    IDLE_CLOSE_MS: 12 * HOUR,
    ROOM_TTL_MS: 7 * 24 * HOUR,
    CAS_ATTEMPTS: 5,
} as const;

export const KEEP = {APPLIED: 64, LEDGER_EVENTS: 12, LOG_SUMMARY: 200, LOG_TAIL: 12, EMOTES: 20} as const;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);

export const GameConfigSchema = z.strictObject({
    seats: whole(TABLE_LIMITS.seats.min, TABLE_LIMITS.seats.max),
    smallBlind: whole(TABLE_LIMITS.smallBlind.min, TABLE_LIMITS.bigBlind.max),
    bigBlind: whole(TABLE_LIMITS.smallBlind.min, TABLE_LIMITS.bigBlind.max),
    ante: whole(0, TABLE_LIMITS.bigBlind.max),
    buyInMin: whole(1, TABLE_LIMITS.buyIn.max),
    buyInMax: whole(1, TABLE_LIMITS.buyIn.max),
    rebuys: z.enum(['off', 'auto', 'approve']),
    maxRebuys: whole(TABLE_LIMITS.maxRebuys.min, TABLE_LIMITS.maxRebuys.max).nullable(),
    turnSeconds: whole(TABLE_LIMITS.turnSeconds.min, TABLE_LIMITS.turnSeconds.max),
    pauseSeconds: whole(TABLE_LIMITS.pauseSeconds.min, TABLE_LIMITS.pauseSeconds.max),
    sitOutAfter: whole(TABLE_LIMITS.sitOutAfter.min, TABLE_LIMITS.sitOutAfter.max),
}).superRefine((c, ctx) => {
    const issue = (path: keyof GameConfig, message: string) => ctx.addIssue({code: 'custom', path: [path], message});
    if (c.bigBlind < c.smallBlind) issue('bigBlind', 'below-small-blind');
    if (c.ante > c.bigBlind) issue('ante', 'above-big-blind');
    if (c.buyInMin < c.bigBlind) issue('buyInMin', 'below-big-blind');
    if (c.buyInMax < c.buyInMin) issue('buyInMax', 'below-buy-in-min');
    if (c.buyInMax > Math.min(TABLE_LIMITS.buyIn.bigBlinds * c.bigBlind, TABLE_LIMITS.buyIn.max)) issue('buyInMax', 'above-cap');
});

export const RoomSettingsSchema = z.strictObject({
    name: z.string().max(TABLE_LIMITS.tableName),
    scene: z.enum(SCENE_IDS),
    felt: z.enum(FELT_IDS),
    throwables: z.boolean(),
    locked: z.boolean(),
    showToFriends: z.boolean(),
});

export type ConfigIssue = {path: string; message: string};

export const checkConfig = (input: unknown): {ok: true; config: GameConfig} | {ok: false; issues: ConfigIssue[]} => {
    const parsed = GameConfigSchema.safeParse(input);
    if (parsed.success) return {ok: true, config: parsed.data};
    return {ok: false, issues: parsed.error.issues.map((i) => ({path: i.path.join('.') || 'config', message: i.message}))};
};

// The config with a patch's present fields laid over it; the result still needs checkConfig.
export const mergeConfig = (config: GameConfig, patch: Partial<GameConfig>): GameConfig => {
    const next = {...config};
    for (const key of Object.keys(patch) as (keyof GameConfig)[]) {
        if (patch[key] !== undefined) (next as Record<keyof GameConfig, unknown>)[key] = patch[key];
    }
    return next;
};

// How long the table shows a result before the next deal may come: a showdown's reveal takes three
// seconds plus 1.2 for each side pot; an uncontested pot a second and a half. The client's winner
// choreography runs on the same figure.
export const revealMs = (result: {showdown: boolean; pots: readonly unknown[]}): number =>
    result.showdown ? 3000 + 1200 * Math.max(0, result.pots.length - 1) : 1500;
