import {describe, expect, it} from 'vitest';
import {
    ROBOT_SHOWN_KEY,
    ROBOT_TIP_FIRST_MS,
    ROBOT_TIP_GAP_MS,
    ROBOT_TIP_HOLD_MS,
    ROBOT_TIP_VISIBLE_MS,
    nextRobotTip,
    readShownTips,
    rememberShownTip,
    robotTipDelay,
    robotTipOrder,
    robotTipsOn,
} from '@/lib/chat/robot-tips';
import {ROBOT_TIPS} from '@/lib/learn/copy/robot';

// Ten consecutive ET dates.
const DATES = Array.from({length: 10}, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);

// A sessionStorage stand-in: the two methods the module uses, over a Map.
const fakeStorage = (seed: Record<string, string> = {}) => {
    const map = new Map(Object.entries(seed));
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => { map.set(key, value); },
        map,
    };
};

const isRotation = (candidate: string[], of: string[]): boolean =>
    candidate.length === of.length
    && of.some((_, k) => [...of.slice(k), ...of.slice(0, k)].every((id, i) => id === candidate[i]));

describe('robotTipsOn', () => {
    it('is the topics section and nothing else', () => {
        expect(robotTipsOn('/topics')).toBe(true);
        expect(robotTipsOn('/topics/ai-chips')).toBe(true);
        expect(robotTipsOn('/topicsx')).toBe(false);
        expect(robotTipsOn('/news')).toBe(false);
        expect(robotTipsOn('/')).toBe(false);
        expect(robotTipsOn(null)).toBe(false);
        expect(robotTipsOn(undefined)).toBe(false);
    });
});

describe('robotTipOrder', () => {
    const lead = ROBOT_TIPS[0].id;
    const rest = ROBOT_TIPS.slice(1).map((tip) => tip.id);

    it('leads with the lead tip on every day and rotates the rest by the date', () => {
        const orders = DATES.map((date) => robotTipOrder(date).map((tip) => tip.id));
        for (const order of orders) {
            expect(order[0]).toBe(lead);
            expect(isRotation(order.slice(1), rest), order.join(',')).toBe(true);
        }
        expect(new Set(orders.map((order) => order.join(','))).size).toBeGreaterThanOrEqual(2);
    });

    it('is the same order for the same date', () => {
        expect(robotTipOrder('2026-10-02')).toEqual(robotTipOrder('2026-10-02'));
    });

    it('returns a one-tip list as it is and an empty list empty', () => {
        expect(robotTipOrder('2026-10-02', [ROBOT_TIPS[0]])).toEqual([ROBOT_TIPS[0]]);
        expect(robotTipOrder('2026-10-02', [])).toEqual([]);
    });
});

describe('nextRobotTip', () => {
    it('is the lead tip first, then the next of the day not yet shown, then nothing', () => {
        const date = '2026-10-02';
        const order = robotTipOrder(date);
        expect(nextRobotTip(date, [])).toEqual(order[0]);
        expect(nextRobotTip(date, [order[0].id])).toEqual(order[1]);
        expect(nextRobotTip(date, [order[0].id, order[2].id])).toEqual(order[1]);
        expect(nextRobotTip(date, order.map((tip) => tip.id))).toBeNull();
    });
});

describe('readShownTips / rememberShownTip', () => {
    it('round-trips the ids shown, each once', () => {
        const storage = fakeStorage();
        expect(readShownTips(storage)).toEqual([]);
        rememberShownTip(storage, 'build-topics');
        rememberShownTip(storage, 'themes');
        rememberShownTip(storage, 'build-topics');
        expect(readShownTips(storage)).toEqual(['build-topics', 'themes']);
        expect(storage.map.get(ROBOT_SHOWN_KEY)).toBe('["build-topics","themes"]');
    });

    it('reads anything but an array of strings as none, and keeps the strings of a mixed one', () => {
        expect(readShownTips(fakeStorage({[ROBOT_SHOWN_KEY]: 'not json'}))).toEqual([]);
        expect(readShownTips(fakeStorage({[ROBOT_SHOWN_KEY]: '{"a":1}'}))).toEqual([]);
        expect(readShownTips(fakeStorage({[ROBOT_SHOWN_KEY]: '["x", 3]'}))).toEqual(['x']);
    });

    it('survives a missing or throwing store', () => {
        expect(readShownTips(null)).toEqual([]);
        expect(() => rememberShownTip(null, 'x')).not.toThrow();
        const blocked = {
            getItem: () => { throw new Error('blocked'); },
            setItem: () => { throw new Error('quota'); },
        };
        expect(readShownTips(blocked)).toEqual([]);
        expect(() => rememberShownTip(blocked, 'x')).not.toThrow();
    });
});

describe('the timings and the key', () => {
    it('waits the first delay only before the first tip of a session', () => {
        expect(robotTipDelay([])).toBe(ROBOT_TIP_FIRST_MS);
        expect(robotTipDelay(['x'])).toBe(ROBOT_TIP_GAP_MS);
    });

    it('speaks well after the QA waits, for long enough, and not too often', () => {
        // The visual sweep settles 600ms and qa-topics waits 800ms after load: neither sees a bubble.
        expect(ROBOT_TIP_FIRST_MS).toBeGreaterThanOrEqual(10_000);
        expect(ROBOT_TIP_VISIBLE_MS).toBeGreaterThanOrEqual(8_000);
        expect(ROBOT_TIP_GAP_MS).toBeGreaterThan(ROBOT_TIP_VISIBLE_MS);
    });

    it('looks again soon, not at once, while the reader is on a tip', () => {
        expect(ROBOT_TIP_HOLD_MS).toBeGreaterThanOrEqual(250);
        expect(ROBOT_TIP_HOLD_MS).toBeLessThan(ROBOT_TIP_VISIBLE_MS);
    });

    it('keeps its storage key out of the chat conversations qa-chat counts', () => {
        expect(ROBOT_SHOWN_KEY.startsWith('aero-robot:')).toBe(true);
        expect(ROBOT_SHOWN_KEY.startsWith('aero-chat:')).toBe(false);
    });
});
