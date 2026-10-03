import {describe, expect, it} from 'vitest';
import {NEWS_SEEN_EVENT, announceNewsSeen, subscribeNewsSeen} from '@/lib/shell/news-seen';

// The marker announces a stamp on the window; the rail and the drawer listen. Modelled on
// lib/chat/ask.ts, and tested the same way: on a bare EventTarget, with no window at all.
describe('announceNewsSeen / subscribeNewsSeen', () => {
    it('delivers one call per announcement until unsubscribed', () => {
        const target = new EventTarget();
        let seen = 0;
        const unsubscribe = subscribeNewsSeen(() => { seen += 1; }, target);
        announceNewsSeen(target);
        announceNewsSeen(target);
        expect(seen).toBe(2);
        unsubscribe();
        announceNewsSeen(target);
        expect(seen).toBe(2);
    });

    it('is a no-op without a window', () => {
        expect(() => announceNewsSeen(undefined)).not.toThrow();
        expect(subscribeNewsSeen(() => {}, undefined)()).toBeUndefined();
    });

    it('names its event once, for anyone listening by hand', () => {
        expect(NEWS_SEEN_EVENT).toBe('aero:news-seen');
    });
});
