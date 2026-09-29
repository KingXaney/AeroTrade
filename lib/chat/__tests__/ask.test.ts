import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ASK_EVENT, ASK_MAX_CHARS, askAdvisor, buildAskPrompt, subscribeAsk} from '@/lib/chat/ask';

describe('buildAskPrompt', () => {
    it('templates each kind into one plain question', () => {
        expect(buildAskPrompt({kind: 'term', term: 'Max drawdown'})).toBe('What does "Max drawdown" mean here?');
        expect(buildAskPrompt({kind: 'term', term: 'Max drawdown', value: '−8.20%'})).toBe('What does "Max drawdown" mean, and what does −8.20% say in my case?');
        expect(buildAskPrompt({kind: 'reason', reason: 'enter: RSI(2) 6.3 < 10 with close above SMA200', symbol: 'XLK', strategy: 'RSI-2 Mean Reversion'}))
            .toBe('Explain this reason from the RSI-2 Mean Reversion strategy for XLK: enter: RSI(2) 6.3 < 10 with close above SMA200');
        expect(buildAskPrompt({kind: 'figure', label: 'Win rate', value: '60%', where: 'the portfolio analytics'}))
            .toBe('What does Win rate mean, and what does 60% say about the portfolio analytics?');
    });

    it('strips control characters and clips long input', () => {
        const long = buildAskPrompt({kind: 'reason', reason: 'x'.repeat(1000)});
        expect(long.length).toBe(ASK_MAX_CHARS);
        expect(long.endsWith('…')).toBe(true);
        expect(buildAskPrompt({kind: 'term', term: 'a\nb\u0000c'})).toBe('What does "a b c" mean here?');
    });

    it('never asks for advice', () => {
        const fixtures = [
            buildAskPrompt({kind: 'term', term: 'P/E ratio', value: '31.2'}),
            buildAskPrompt({kind: 'reason', reason: 'below 200d MA — capped', symbol: 'NVDA'}),
            buildAskPrompt({kind: 'figure', label: 'Max drawdown', value: '−8.20%', where: 'the portfolio analytics'}),
        ];
        for (const text of fixtures) expect(findBanned(text, 'advice'), text).toEqual([]);
    });
});

describe('askAdvisor / subscribeAsk', () => {
    it('delivers a cleaned string and ignores anything else', () => {
        const target = new EventTarget();
        const seen: string[] = [];
        const unsubscribe = subscribeAsk((text) => seen.push(text), target);
        askAdvisor('  hello\nworld ', target);
        target.dispatchEvent(new CustomEvent(ASK_EVENT, {detail: {text: 42}}));
        target.dispatchEvent(new CustomEvent(ASK_EVENT, {detail: null}));
        target.dispatchEvent(new CustomEvent(ASK_EVENT, {detail: {text: '   '}}));
        expect(seen).toEqual(['hello world']);
        unsubscribe();
        askAdvisor('after', target);
        expect(seen).toEqual(['hello world']);
    });

    it('is a no-op without a window', () => {
        expect(() => askAdvisor('x', undefined)).not.toThrow();
        expect(subscribeAsk(() => {}, undefined)()).toBeUndefined();
    });
});
