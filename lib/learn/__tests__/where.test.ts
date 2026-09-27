import {describe, expect, it} from 'vitest';
import {GLOSSARY, GLOSSARY_KEYS} from '@/lib/learn/glossary';
import {GLOSSARY_GROUPS, groupOf, whereItLives} from '@/lib/learn/where';

describe('whereItLives', () => {
    it('places every entry in exactly one group with an in-app home', () => {
        const seen = new Map<string, string>();
        for (const group of GLOSSARY_GROUPS) {
            expect(group.home.href).toMatch(/^\/[a-z]+$/);
            for (const key of group.keys) {
                expect(seen.has(key), key).toBe(false);
                seen.set(key, group.id);
            }
        }
        expect([...seen.keys()].sort()).toEqual([...GLOSSARY_KEYS].sort());
    });

    it('sends board columns to the strategies, account tiles to the portfolio, concepts to topics', () => {
        expect(whereItLives(GLOSSARY.rsi2).href).toBe('/strategies');
        expect(whereItLives(GLOSSARY['max-drawdown']).href).toBe('/portfolio');
        expect(whereItLives(GLOSSARY['pe-ratio']).href).toBe('/watchlist');
        expect(whereItLives(GLOSSARY.fomc).href).toBe('/topics');
        expect(groupOf(GLOSSARY['position-cap'])).toBe('rails');
    });
});
