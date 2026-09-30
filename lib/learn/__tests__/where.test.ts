import {describe, expect, it} from 'vitest';
import {GLOSSARY, GLOSSARY_KEYS} from '@/lib/learn/glossary';
import {GLOSSARY_GROUPS, groupOf, whereItLives} from '@/lib/learn/where';
import {EVENT_BADGES} from '@/lib/learn/event-types';

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

    it('homes the brain\'s numbers and event labels on /brain, beside the rails', () => {
        const eventTerms = Object.values(EVENT_BADGES).map((badge) => badge.term);
        expect(eventTerms).toHaveLength(8);
        for (const key of ['news-weight', 'news-sentiment', 'thesis', 'since-thesis', ...eventTerms] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('brain');
            expect(whereItLives(GLOSSARY[key]).href, key).toBe('/brain');
        }
        expect(GLOSSARY_GROUPS.map((group) => group.id)).toEqual(['board', 'portfolio', 'market', 'concepts', 'brain', 'rails']);
    });
});
