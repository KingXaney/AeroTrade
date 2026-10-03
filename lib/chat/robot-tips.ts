// When the robot speaks (components/chat/ChatWidget): on the topics pages only, while the panel is
// closed — the first tip ROBOT_TIP_FIRST_MS after the page is entered, each shown for
// ROBOT_TIP_VISIBLE_MS, the next ROBOT_TIP_GAP_MS later — and no tip twice in a browser session:
// the ids shown are kept in sessionStorage under ROBOT_SHOWN_KEY. Pure and client-safe; it imports
// the copy and lib/text.hashId, nothing else.

import {ROBOT_TIPS, type RobotTip} from "@/lib/learn/copy/robot";
import {hashId} from "@/lib/text";

// Past the visual sweep's 600ms settle and qa-topics' 800ms wait after load, so neither ever sees
// a bubble; the sweep's STILL css and the motion guards only ever have CSS to stop.
export const ROBOT_TIP_FIRST_MS = 15_000;
export const ROBOT_TIP_VISIBLE_MS = 12_000;
export const ROBOT_TIP_GAP_MS = 90_000;
// sessionStorage, so a tab remembers and a new one starts over. Not under 'aero-chat:' —
// scripts/qa/qa-chat.mjs counts those keys as stored conversations.
export const ROBOT_SHOWN_KEY = 'aero-robot:shown';

type TipStorage = Pick<Storage, 'getItem' | 'setItem'>;

// The whole topics section: /topics — the empty state included, where "let me build your topics"
// matters most — and every /topics/<slug>.
export const robotTipsOn = (pathname: string | null | undefined): boolean =>
    pathname === '/topics' || (typeof pathname === 'string' && pathname.startsWith('/topics/'));

// The day's order: the lead tip first, the rest rotated by the date, so everyone sees the same
// order on a day and it moves on the next.
export const robotTipOrder = (date: string, tips: readonly RobotTip[] = ROBOT_TIPS): RobotTip[] => {
    if (tips.length === 0) return [];
    const [lead, ...rest] = tips;
    if (rest.length === 0) return [lead];
    const start = hashId(date) % rest.length;
    return [lead, ...rest.slice(start), ...rest.slice(0, start)];
};

// The ids shown this session: a JSON array of strings; anything else — nothing stored, corrupt
// data, a blocked store — reads as none.
export const readShownTips = (storage: TipStorage | null): string[] => {
    if (!storage) return [];
    try {
        const parsed: unknown = JSON.parse(storage.getItem(ROBOT_SHOWN_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

export const rememberShownTip = (storage: TipStorage | null, id: string): void => {
    if (!storage) return;
    const shown = readShownTips(storage);
    if (shown.includes(id)) return;
    try {
        storage.setItem(ROBOT_SHOWN_KEY, JSON.stringify([...shown, id]));
    } catch {
        // Quota or a blocked store: the tip may come back after a reload, nothing else changes.
    }
};

// The next tip to show: the first of the day's order not yet shown, or null once every tip has been.
export const nextRobotTip = (date: string, shown: readonly string[], tips: readonly RobotTip[] = ROBOT_TIPS): RobotTip | null =>
    robotTipOrder(date, tips).find((tip) => !shown.includes(tip.id)) ?? null;

// How long the robot waits before speaking: the first tip of a session comes sooner than the rest.
export const robotTipDelay = (shown: readonly string[]): number =>
    shown.length === 0 ? ROBOT_TIP_FIRST_MS : ROBOT_TIP_GAP_MS;
