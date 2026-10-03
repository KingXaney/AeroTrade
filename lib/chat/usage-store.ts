// Server-only: the chat's three rate-limit windows for one reader, read without spending one —
// three indexed point reads through peekRateLimit, shaped by the pure lib/chat/usage.ts. Served
// by app/api/chat/usage/route.ts, which the panel calls on open and after each reply or refusal.
// The limits resolve per read; a bad override is logged once by app/api/chat/route.ts, not here.

import {peekRateLimit} from "@/lib/rate-limit";
import {CHAT_GLOBAL_KEY, chatUserDayKey, chatUserHourKey, resolveChatLimits, type ChatLimits} from "@/lib/chat/limits";
import {toChatUsage, type ChatUsage} from "@/lib/chat/usage";

export const readChatUsage = async (userId: string, now: number = Date.now(), limits: ChatLimits = resolveChatLimits()): Promise<ChatUsage> => {
    const [hour, day, global] = await Promise.all([
        peekRateLimit(chatUserHourKey(userId)),
        peekRateLimit(chatUserDayKey(userId)),
        peekRateLimit(CHAT_GLOBAL_KEY),
    ]);
    return toChatUsage({hour, day, global}, limits, now);
};
