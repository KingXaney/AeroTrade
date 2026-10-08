// Poker night's numbers: the state version, the limits a host chooses within, the defaults, the
// clock, how much of each list the state keeps, and the zod schemas that hold a config or a room's
// settings to them. Pure and client-safe — the host drawer validates with the same schemas.

import {z} from 'zod';
import type {GameConfig, RoomSettings, Variant} from '@/lib/poker-night/types';

// A stored state field never changes meaning without bumping this and adding a migration
// (lib/poker-night/migrate.ts). Version 2 landed at once every stored field the modes (PLO, Triple
// T), leaving after a hand, the host-approved buys and the asks to see a hand need, so the phases
// after it only switch behaviour on.
export const STATE_VERSION = 2;

// Index orders the stored log, ledger and ask tuples rely on: append only, never reorder.
export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export const ENTRY_KINDS = ['ante', 'small-blind', 'big-blind', 'post', 'fold', 'check', 'call', 'bet', 'raise', 'refund', 'show', 'void', 'discard'] as const;
export const LEDGER_KINDS = ['buy-in', 'rebuy', 'top-up', 'cash-out', 'removed'] as const;
export const ENTRY_FLAGS = {allIn: 1, timeout: 2, auto: 4} as const;
// What became of an ask to see a hand (types.AskEntry): waiting for the player asked, shown to the
// one who asked, shown to everyone, a no, or left unanswered (taken as a no).
export const ASK_ANSWERS = ['waiting', 'shown', 'everyone', 'no', 'expired'] as const;

// The games. A hand deals HOLE_CARDS of its variant and plays PLAYING_CARDS (Triple T throws one
// away before the betting); only PLO may run more than one board.
export const VARIANTS = ['holdem', 'plo', 'triple-t'] as const;
export const HOLE_CARDS = {holdem: 2, plo: 4, 'triple-t': 3} as const;
export const PLAYING_CARDS = {holdem: 2, plo: 4, 'triple-t': 2} as const;

// What this deploy deals. The stored shape accepts every variant and board count (lib/poker-night/
// migrate), so a rollback never closes a live table; only the input paths (checkConfig) and the
// deal (dealable) are held to this. Later phases open 'plo', two and three boards, 'triple-t'.
export const ENABLED: {readonly variants: readonly Variant[]; readonly boards: number} = Object.freeze({
    variants: Object.freeze(['holdem'] as Variant[]),
    boards: 1,
});

// Triple T's throw-away: everyone at once, on the turn's clock but never above this.
export const DISCARD_MAX_SECONDS = 20;
export const discardMs = (c: Pick<GameConfig, 'turnSeconds'>): number => Math.min(c.turnSeconds, DISCARD_MAX_SECONDS) * 1000;

// The cards one deal takes: every seat's hole cards and five per board — at most 4·9 + 5·3 = 51.
export const cardsNeeded = (c: Pick<GameConfig, 'variant' | 'boards' | 'seats'>): number => HOLE_CARDS[c.variant] * c.seats + 5 * c.boards;

// Asking to see a hand once it completes (engine.ask): one ask waiting per player at a time, at most
// PER_HAND a hand, each answered within WAIT_MS or taken as a no; after a no the same player may not
// ask the same player again for COOLDOWN_HANDS hands. The state keeps the latest COOLDOWNS_KEPT of
// those, and every ask ends at the next deal.
export const ASKS = {WAIT_MS: 15_000, PER_HAND: 2, COOLDOWN_HANDS: 5, COOLDOWNS_KEPT: 12} as const;

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
    boards: {min: 1, max: 3},
    tableName: 40,
} as const;

// The rebuy policy: off, or on — the host approving every buy but their own once the first hand is
// dealt (engine.needsHost). Version 1's third policy, 'auto', reads as 'approve' (migrate.v1ToV2).
export const REBUY_POLICIES = ['off', 'approve'] as const;

// The variant and the board count come last, as a v1 config migrated to v2 has them: a config's key
// order is part of the engine's sameJson check.
export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
    seats: 8, smallBlind: 10, bigBlind: 20, ante: 0, buyInMin: 2000, buyInMax: 2000,
    rebuys: 'approve', maxRebuys: null, turnSeconds: 30, pauseSeconds: 5, sitOutAfter: 2, variant: 'holdem', boards: 1,
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

// APPLIED: the action ids the room remembers (a retried request is answered, not applied again);
// version 2 keeps 40, from 64, to pay for its private fields in the room document's budget.
export const KEEP = {APPLIED: 40, LEDGER_EVENTS: 12, LOG_SUMMARY: 200, LOG_TAIL: 12, EMOTES: 20} as const;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);

// A config's fields, bare: input.ts and migrate.ts build their own objects from it (zod cannot
// .omit() a refined schema), and each refines with refineConfig.
export const GAME_CONFIG_SHAPE = {
    seats: whole(TABLE_LIMITS.seats.min, TABLE_LIMITS.seats.max),
    smallBlind: whole(TABLE_LIMITS.smallBlind.min, TABLE_LIMITS.bigBlind.max),
    bigBlind: whole(TABLE_LIMITS.smallBlind.min, TABLE_LIMITS.bigBlind.max),
    ante: whole(0, TABLE_LIMITS.bigBlind.max),
    buyInMin: whole(1, TABLE_LIMITS.buyIn.max),
    buyInMax: whole(1, TABLE_LIMITS.buyIn.max),
    rebuys: z.enum(REBUY_POLICIES),
    maxRebuys: whole(TABLE_LIMITS.maxRebuys.min, TABLE_LIMITS.maxRebuys.max).nullable(),
    turnSeconds: whole(TABLE_LIMITS.turnSeconds.min, TABLE_LIMITS.turnSeconds.max),
    pauseSeconds: whole(TABLE_LIMITS.pauseSeconds.min, TABLE_LIMITS.pauseSeconds.max),
    sitOutAfter: whole(TABLE_LIMITS.sitOutAfter.min, TABLE_LIMITS.sitOutAfter.max),
    variant: z.enum(VARIANTS),
    boards: z.union([z.literal(1), z.literal(2), z.literal(3)]),
};

type ConfigFields = Omit<GameConfig, 'variant' | 'boards' | 'rebuys'> & {rebuys: string} & Partial<Pick<GameConfig, 'variant' | 'boards'>>;

// The rules across fields. A v1 config has no variant or boards, so those are checked only when
// present.
export const refineConfig = (c: ConfigFields, ctx: z.RefinementCtx): void => {
    const issue = (path: keyof GameConfig, message: string) => ctx.addIssue({code: 'custom', path: [path], message});
    if (c.bigBlind < c.smallBlind) issue('bigBlind', 'below-small-blind');
    if (c.ante > c.bigBlind) issue('ante', 'above-big-blind');
    if (c.buyInMin < c.bigBlind) issue('buyInMin', 'below-big-blind');
    if (c.buyInMax < c.buyInMin) issue('buyInMax', 'below-buy-in-min');
    if (c.buyInMax > Math.min(TABLE_LIMITS.buyIn.bigBlinds * c.bigBlind, TABLE_LIMITS.buyIn.max)) issue('buyInMax', 'above-cap');
    if (c.variant !== undefined && c.boards !== undefined) {
        if (c.boards > 1 && c.variant !== 'plo') issue('boards', 'plo-only');
        if (cardsNeeded({variant: c.variant, boards: c.boards, seats: c.seats}) > 52) issue('seats', 'too-many-cards');
    }
};

// What a stored config may hold: every variant and board count, whatever ENABLED says.
export const GameConfigSchema = z.strictObject(GAME_CONFIG_SHAPE).superRefine(refineConfig);

export const RoomSettingsSchema = z.strictObject({
    name: z.string().max(TABLE_LIMITS.tableName),
    scene: z.enum(SCENE_IDS),
    felt: z.enum(FELT_IDS),
    throwables: z.boolean(),
    locked: z.boolean(),
    showToFriends: z.boolean(),
});

export type ConfigIssue = {path: string; message: string};

// Whether this deploy deals the config's game (ENABLED): a table set to one it does not wait
// between hands, its config intact, until the host picks one it does (engine.reschedule).
export const dealable = (c: Pick<GameConfig, 'variant' | 'boards'>): boolean => ENABLED.variants.includes(c.variant) && c.boards <= ENABLED.boards;

// A config a host or the lobby asks for: the stored schema, then the game this deploy deals — a
// variant or a board count not open yet is 'not-open'.
export const checkConfig = (input: unknown): {ok: true; config: GameConfig} | {ok: false; issues: ConfigIssue[]} => {
    const parsed = GameConfigSchema.safeParse(input);
    if (!parsed.success) return {ok: false, issues: parsed.error.issues.map((i) => ({path: i.path.join('.') || 'config', message: i.message}))};
    const config = parsed.data as GameConfig;
    const issues: ConfigIssue[] = [];
    if (!ENABLED.variants.includes(config.variant)) issues.push({path: 'variant', message: 'not-open'});
    if (config.boards > ENABLED.boards) issues.push({path: 'boards', message: 'not-open'});
    return issues.length > 0 ? {ok: false, issues} : {ok: true, config};
};

// The config with a patch's present fields laid over it; the result still needs checkConfig. A patch
// that names a game other than PLO and no board count plays one board, so going back to Texas
// hold'em is never refused for the boards PLO had.
export const mergeConfig = (config: GameConfig, patch: Partial<GameConfig>): GameConfig => {
    const next = {...config};
    for (const key of Object.keys(patch) as (keyof GameConfig)[]) {
        if (patch[key] !== undefined) (next as Record<keyof GameConfig, unknown>)[key] = patch[key];
    }
    if (patch.variant !== undefined && patch.variant !== 'plo' && patch.boards === undefined) next.boards = 1;
    return next;
};

// How long the table shows a result before the next deal may come: a showdown's reveal takes three
// seconds, plus 1.2 for each side pot and one for each board past the first; an uncontested pot a
// second and a half. The client's winner choreography runs on the same figure.
export const revealMs = (result: {showdown: boolean; pots: readonly unknown[]; boards?: number}): number =>
    result.showdown ? 3000 + 1200 * Math.max(0, result.pots.length - 1) + 1000 * Math.max(0, (result.boards ?? 1) - 1) : 1500;
