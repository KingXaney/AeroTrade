// The config's rules as version 2 sets them: every game and board count the stored shape takes,
// what this deploy deals (ENABLED: Texas hold'em on one board for now, the input paths' gate alone),
// more than one board for PLO only, every deal within one deck, a change back to a one-board game
// that names no board count, the reveal's length, and the rebuy policy's two values.

import {describe, expect, it} from 'vitest';
import {
    cardsNeeded, checkConfig, dealable, DEFAULT_CONFIG, discardMs, DISCARD_MAX_SECONDS, ENABLED, GameConfigSchema, HOLE_CARDS, mergeConfig,
    REBUY_POLICIES, revealMs, TABLE_LIMITS, VARIANTS,
} from '@/lib/poker-night/config';
import type {GameConfig} from '@/lib/poker-night/types';

const issues = (input: unknown): string[] => {
    const checked = checkConfig(input);
    return checked.ok ? [] : checked.issues.map((i) => `${i.path} ${i.message}`);
};

describe('the games a config names', () => {
    it('fits every game, board count and seat count in one deck: at most 51 cards', () => {
        let most = 0;
        for (const variant of VARIANTS) {
            for (const boards of [1, 2, 3] as const) {
                for (let seats = TABLE_LIMITS.seats.min; seats <= TABLE_LIMITS.seats.max; seats++) {
                    const n = cardsNeeded({variant, boards, seats});
                    expect(n).toBe(HOLE_CARDS[variant] * seats + 5 * boards);
                    most = Math.max(most, n);
                }
            }
        }
        expect(most).toBe(51);
    });

    it('stores every game and board count, but deals only what is open here', () => {
        expect(ENABLED.variants).toEqual(['holdem']);
        expect(ENABLED.boards).toBe(1);
        const plo: GameConfig = {...DEFAULT_CONFIG, variant: 'plo', boards: 3};
        // The stored shape takes it (a rollback never closes a table that plays it)...
        expect(GameConfigSchema.safeParse(plo).success).toBe(true);
        expect(GameConfigSchema.safeParse({...DEFAULT_CONFIG, variant: 'triple-t'}).success).toBe(true);
        // ...the input paths and the deal do not.
        expect(issues(plo)).toEqual(['variant not-open', 'boards not-open']);
        expect(issues({...DEFAULT_CONFIG, variant: 'triple-t'})).toEqual(['variant not-open']);
        expect(dealable(plo)).toBe(false);
        expect(dealable(DEFAULT_CONFIG)).toBe(true);
        expect(checkConfig(DEFAULT_CONFIG)).toEqual({ok: true, config: DEFAULT_CONFIG});
    });

    it('keeps more than one board for PLO, in the stored shape too', () => {
        expect(GameConfigSchema.safeParse({...DEFAULT_CONFIG, boards: 2}).success).toBe(false);
        expect(issues({...DEFAULT_CONFIG, boards: 2})).toEqual(['boards plo-only']);
        expect(GameConfigSchema.safeParse({...DEFAULT_CONFIG, boards: 4}).success).toBe(false);
        expect(GameConfigSchema.safeParse({...DEFAULT_CONFIG, variant: 'omaha'}).success).toBe(false);
    });

    it('lays the game and board count last, and goes back to one board with a game that names none', () => {
        expect(Object.keys(DEFAULT_CONFIG).slice(-2)).toEqual(['variant', 'boards']);
        const plo: GameConfig = {...DEFAULT_CONFIG, variant: 'plo', boards: 3};
        expect(mergeConfig(plo, {variant: 'holdem'})).toMatchObject({variant: 'holdem', boards: 1});
        expect(mergeConfig(plo, {variant: 'plo'})).toMatchObject({variant: 'plo', boards: 3});
        expect(mergeConfig(plo, {variant: 'triple-t', boards: 2})).toMatchObject({variant: 'triple-t', boards: 2});
        expect(mergeConfig(plo, {turnSeconds: 60})).toMatchObject({variant: 'plo', boards: 3, turnSeconds: 60});
        expect(Object.keys(mergeConfig(DEFAULT_CONFIG, {variant: 'holdem'}))).toEqual(Object.keys(DEFAULT_CONFIG));
    });

    it('has two rebuy policies: off, or on with the host approving', () => {
        expect(REBUY_POLICIES).toEqual(['off', 'approve']);
        expect(DEFAULT_CONFIG.rebuys).toBe('approve');
        expect(GameConfigSchema.safeParse({...DEFAULT_CONFIG, rebuys: 'auto'}).success).toBe(false);
    });
});

describe('the clocks', () => {
    it('gives Triple T\'s throw-away the turn\'s time, never above twenty seconds', () => {
        expect(DISCARD_MAX_SECONDS).toBe(20);
        expect(discardMs({turnSeconds: 15})).toBe(15_000);
        expect(discardMs({turnSeconds: 30})).toBe(20_000);
    });

    it('shows a result for three seconds, plus 1.2 a side pot and one a board past the first', () => {
        expect(revealMs({showdown: false, pots: [1, 2]})).toBe(1500);
        expect(revealMs({showdown: true, pots: [1]})).toBe(3000);
        expect(revealMs({showdown: true, pots: [1, 2, 3], boards: 1})).toBe(5400);
        expect(revealMs({showdown: true, pots: [1, 2], boards: 3})).toBe(3000 + 1200 + 2000);
    });
});
