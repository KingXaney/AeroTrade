// The guard on the one request-time model path. Three fixed windows, checked in
// order — the user's hour, the user's day, then everyone's day — so a stuck client
// is stopped by its own windows before it can drain the shared budget. Defaults are
// deliberately conservative: nothing in the repo records Gemini's real ceiling, so the
// owner tunes them through the environment rather than a code change.
//
// Import-free so the resolver is unit-tested like resolveTier.

export const CHAT_USER_HOURLY_LIMIT = 30;
export const CHAT_USER_DAILY_LIMIT = 60;
export const CHAT_GLOBAL_DAILY_LIMIT = 200;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const chatUserHourKey = (userId: string): string => `chat:${userId}`;
export const chatUserDayKey = (userId: string): string => `chat:${userId}:day`;
export const CHAT_GLOBAL_KEY = 'chat:global';

type ChatLimit = {limit: number; windowMs: number};
type ChatLimits = {
    userHour: ChatLimit;
    userDay: ChatLimit;
    global: ChatLimit;
    warning?: string;
};

const positiveInt = (raw: string | undefined, fallback: number, name: string): {value: number; warning?: string} => {
    if (raw === undefined || raw === '') return {value: fallback};
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return {value: fallback, warning: `${name}="${raw}" is not a positive integer — using ${fallback}.`};
    }
    return {value: parsed};
};

type EnvLike = Record<string, string | undefined>;

export const resolveChatLimits = (env: EnvLike = process.env): ChatLimits => {
    const hour = positiveInt(env.CHAT_USER_HOURLY_LIMIT, CHAT_USER_HOURLY_LIMIT, 'CHAT_USER_HOURLY_LIMIT');
    const day = positiveInt(env.CHAT_USER_DAILY_LIMIT, CHAT_USER_DAILY_LIMIT, 'CHAT_USER_DAILY_LIMIT');
    const global = positiveInt(env.CHAT_GLOBAL_DAILY_LIMIT, CHAT_GLOBAL_DAILY_LIMIT, 'CHAT_GLOBAL_DAILY_LIMIT');
    const warning = [hour.warning, day.warning, global.warning].filter(Boolean).join(' ');
    return {
        userHour: {limit: hour.value, windowMs: HOUR_MS},
        userDay: {limit: day.value, windowMs: DAY_MS},
        global: {limit: global.value, windowMs: DAY_MS},
        ...(warning ? {warning} : {}),
    };
};
