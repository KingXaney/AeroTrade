import {describe, expect, it} from 'vitest';
import {GLOSSARY, GLOSSARY_KEYS} from '@/lib/learn/glossary';
import {GLOSSARY_GROUPS, glossaryGroupsFor, groupOf} from '@/lib/learn/where';
import {EVENT_BADGES} from '@/lib/brain/event-types';
import {SIGNAL_BADGES} from '@/lib/culture/signal-types';

// The in-app home of a term: its group's, as the glossary page links it.
const homeOf = (key: string): string | undefined => GLOSSARY_GROUPS.find((group) => group.keys.includes(key as never))?.home.href;

describe('where each term lives', () => {
    it('places every entry in exactly one group with an in-app home', () => {
        const seen = new Map<string, string>();
        for (const group of GLOSSARY_GROUPS) {
            expect(group.home.href).toMatch(/^\/[a-z-]+$/);
            for (const key of group.keys) {
                expect(seen.has(key), key).toBe(false);
                seen.set(key, group.id);
            }
        }
        expect([...seen.keys()].sort()).toEqual([...GLOSSARY_KEYS].sort());
    });

    it('sends board columns to the strategies, account tiles to the portfolio, concepts to topics', () => {
        expect(homeOf('rsi2')).toBe('/strategies');
        expect(homeOf('max-drawdown')).toBe('/portfolio');
        expect(homeOf('pe-ratio')).toBe('/watchlist');
        expect(homeOf('fomc')).toBe('/topics');
        expect(groupOf(GLOSSARY['position-cap'])).toBe('rails');
    });

    it('homes the brain\'s numbers and event labels on /brain, beside the rails', () => {
        const eventTerms = Object.values(EVENT_BADGES).map((badge) => badge.term);
        expect(eventTerms).toHaveLength(8);
        for (const key of ['news-weight', 'news-sentiment', 'thesis', 'since-thesis', ...eventTerms] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('brain');
            expect(homeOf(key), key).toBe('/brain');
        }
        expect(GLOSSARY_GROUPS.map((group) => group.id)).toEqual(['board', 'portfolio', 'market', 'concepts', 'brain', 'rails', 'culture', 'agent-world', 'games', 'poker', 'landing', 'poker-night']);
    });

    it('homes the trading agent world\'s terms on /agent-world, after the culture brain, leaving the record\'s tiles where they were', () => {
        const desk = GLOSSARY_GROUPS.find((group) => group.id === 'agent-world');
        expect(desk?.home).toEqual({href: '/agent-world', label: 'The trading agent world', owner: true});
        expect(desk?.label).toBe('In the trading agent world');
        expect(desk?.keys).toEqual([
            'desk-session', 'desk-role', 'analyst-report', 'research-debate', 'desk-rating', 'rating-target', 'desk-rails',
            'session-approval', 'approval-lapse', 'agent-budget', 'heartbeat', 'approval-stage', 'data-vendor', 'point-in-time',
            'tool-call', 'model-tokens', 'session-cost',
        ]);
        for (const key of desk?.keys ?? []) {
            expect(GLOSSARY[key].kind, key).toBe('metric');
            expect(homeOf(key), key).toBe('/agent-world');
        }
        expect(homeOf('total-return')).toBe('/portfolio');
        expect(homeOf('benchmark')).toBe('/portfolio');
    });

    it('homes the culture brain\'s numbers, its pickers and its labels on /culture', () => {
        const signalTerms = Object.values(SIGNAL_BADGES).map((badge) => badge.term);
        expect(signalTerms).toHaveLength(7);
        for (const key of ['attention', 'attention-anomaly', 'quiet-attention', 'category-share', 'brand-thesis', 'brand-owner', 'picker-profile', 'attention-backtest', ...signalTerms] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('culture');
            expect(homeOf(key), key).toBe('/culture');
        }
        expect(homeOf('thesis')).toBe('/brain');
    });

    it('homes the games\' terms on /games', () => {
        for (const key of ['kelly-criterion', 'fair-value', 'bid-ask-spread', 'adverse-selection', 'correlation'] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('games');
            expect(homeOf(key), key).toBe('/games');
        }
    });

    it('homes the terrain\'s terms on the front door', () => {
        for (const key of ['normalized-momentum', 'lookback'] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('landing');
            expect(homeOf(key), key).toBe('/welcome');
        }
        expect(homeOf('volatility')).toBe('/portfolio');
    });

    it('homes the poker solver\'s terms on /poker', () => {
        const poker = GLOSSARY_GROUPS.find((group) => group.id === 'poker');
        expect(poker?.keys).toHaveLength(25);
        for (const key of ['hand-equity', 'hand-range', 'pot-odds', 'push-fold', 'nash-equilibrium', 'exploitability', 'bluff-catcher', 'game-tree'] as const) {
            expect(groupOf(GLOSSARY[key]), key).toBe('poker');
            expect(homeOf(key), key).toBe('/poker');
        }
    });

    it('homes the poker night table\'s terms on its lobby, last, leaving the blinds the solver shares with it', () => {
        const night = GLOSSARY_GROUPS.at(-1);
        expect(night?.id).toBe('poker-night');
        expect(night?.label).toBe('At poker night');
        expect(night?.home).toEqual({href: '/poker-night', label: 'Poker night'});
        expect(night?.keys).toEqual(['side-pot', 'dealer-button', 'small-blind', 'minimum-raise', 'rebuy', 'all-in', 'hand-rankings', 'kicker', 'texas-holdem', 'omaha', 'pot-limit', 'triple-t']);
        for (const key of night?.keys ?? []) expect(GLOSSARY[key].kind, key).toBe('metric');
        expect(groupOf(GLOSSARY['big-blind'])).toBe('poker');
        expect(groupOf(GLOSSARY.ante)).toBe('poker');
    });

    it("leaves the groups homed on the owner's pages out of anyone else's glossary", () => {
        expect(glossaryGroupsFor({owner: true})).toBe(GLOSSARY_GROUPS);
        const everyone = glossaryGroupsFor({owner: false});
        expect(GLOSSARY_GROUPS.filter((group) => group.home.owner).map((group) => group.id)).toEqual(['board', 'brain', 'rails', 'culture', 'agent-world']);
        expect(everyone.map((group) => group.id)).toEqual(['portfolio', 'market', 'concepts', 'games', 'poker', 'landing', 'poker-night']);
        for (const group of everyone) expect(group.home.href, group.id).not.toMatch(/^\/(strategies|brain|culture|agent-world)/);
    });
});
