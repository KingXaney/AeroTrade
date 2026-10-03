// What is left of the chat's three rate-limit windows, as the panel's caption shows it. Pure:
// the rows come from lib/chat/usage-store.ts (peekRateLimit, a read that never spends), the
// limits from lib/chat/limits.ts and `now` from the caller. The view carries that clock as
// `at`, so the client renders "resets in …" from the server's time and never reads its own.

import {z} from "zod";
import type {ChatLimits} from "@/lib/chat/limits";
import {formatTimeUntilMs} from "@/lib/format";
import {CHAT_USAGE_COPY} from "@/lib/learn/copy/chat";

export type ChatWindowId = 'hour' | 'day' | 'global';

// The route's order of checks (app/api/chat/route.ts): the user's hour, the user's day, then
// everyone's day. The first window with nothing left is the one that refuses.
export const CHAT_WINDOW_ORDER: readonly ChatWindowId[] = ['hour', 'day', 'global'];

export type PeekRow = {count: number; expiresAt: number} | null;

export type ChatUsageWindow = {used: number; limit: number; left: number; resetsAt: number | null};

export type ChatUsage = {
    hour: ChatUsageWindow;
    day: ChatUsageWindow;
    global: ChatUsageWindow;
    // The window that would refuse the next message.
    binding: ChatWindowId;
    // The server's clock when the rows were read, epoch ms.
    at: number;
};

// A missing row, or one whose window has passed (the TTL monitor deletes lazily), is a whole
// window. `left` clamps at 0: takeRateLimit counts the refused request too, so a spent hour
// reads 31 of 30 while `used` stays honest.
const windowOf = (row: PeekRow, limit: number, now: number): ChatUsageWindow =>
    !row || row.expiresAt <= now
        ? {used: 0, limit, left: limit, resetsAt: null}
        : {used: Math.max(0, row.count), limit, left: Math.max(0, limit - row.count), resetsAt: row.expiresAt};

export const toChatUsage = (rows: Record<ChatWindowId, PeekRow>, limits: ChatLimits, now: number): ChatUsage => {
    const windows = {
        hour: windowOf(rows.hour, limits.userHour.limit, now),
        day: windowOf(rows.day, limits.userDay.limit, now),
        global: windowOf(rows.global, limits.global.limit, now),
    };
    // The first spent window in the route's order refuses next; otherwise the one with the
    // fewest left, an earlier window winning a tie.
    const binding = CHAT_WINDOW_ORDER.find((id) => windows[id].left === 0)
        ?? CHAT_WINDOW_ORDER.reduce((best, id) => (windows[id].left < windows[best].left ? id : best));
    return {...windows, binding, at: now};
};

export const LOW_FRACTION = 0.2;

// ≤6 of 30, ≤12 of 60, ≤40 of 200.
export const isLow = (w: ChatUsageWindow): boolean => w.left <= Math.floor(w.limit * LOW_FRACTION);

export type ChatUsageCaption = {text: string; exhausted: boolean; binding: ChatWindowId};

// The day and shared clauses always — the reader's own allowance and everyone's; the hour clause
// only while the hour is the window about to refuse and is low, since a fresh "30 left this
// hour" says nothing (invariant 8); exactly one reset clause, for the window being warned about
// (the hour or shared window while it is the binding one and low), else the day's, and none
// while that window has not opened.
export const describeChatUsage = (usage: ChatUsage): ChatUsageCaption => {
    const binding = usage[usage.binding];
    const warned = usage.binding !== 'day' && isLow(binding) ? binding : usage.day;
    const clauses = [
        CHAT_USAGE_COPY.day(usage.day.left, usage.day.limit),
        CHAT_USAGE_COPY.shared(usage.global.left, usage.global.limit),
        ...(usage.binding === 'hour' && isLow(usage.hour) ? [CHAT_USAGE_COPY.hour(usage.hour.left)] : []),
        ...(warned.resetsAt !== null ? [CHAT_USAGE_COPY.resets(formatTimeUntilMs(warned.resetsAt, usage.at))] : []),
    ];
    return {text: clauses.join(CHAT_USAGE_COPY.separator), exhausted: binding.left === 0, binding: usage.binding};
};

const WindowSchema = z.object({
    used: z.number().int().min(0),
    limit: z.number().int().min(1),
    left: z.number().int().min(0),
    resetsAt: z.number().nullable(),
});

export const ChatUsageSchema = z.object({
    hour: WindowSchema,
    day: WindowSchema,
    global: WindowSchema,
    binding: z.enum(['hour', 'day', 'global']),
    at: z.number(),
});

// The client's read of the route's JSON: the shape above, or null — never a throw in render.
export const parseChatUsage = (value: unknown): ChatUsage | null => {
    const result = ChatUsageSchema.safeParse(value);
    return result.success ? result.data : null;
};
