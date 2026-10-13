import {describe, expect, it} from 'vitest';
import {rollupTickers} from '@/lib/culture/rollup';
import type {CultureBrand, CultureEntitySummary} from '@/lib/culture/types';

const CATALOG: readonly CultureBrand[] = [
    {id: 'gatorade', name: 'Gatorade', category: 'drinks', aliases: ['Gatorade'], owner: {company: 'PepsiCo', ticker: 'PEP', listing: 'us'}, wikipedia: ['Gatorade']},
    {id: 'poppi', name: 'Poppi', category: 'drinks', aliases: ['Poppi'], owner: {company: 'PepsiCo', ticker: 'PEP', listing: 'us'}, wikipedia: ['Poppi']},
    {id: 'doritos', name: 'Doritos', category: 'snacks', aliases: ['Doritos'], owner: {company: 'PepsiCo', ticker: 'PEP', listing: 'us'}, wikipedia: ['Doritos']},
    {id: 'celsius', name: 'Celsius', category: 'drinks', aliases: ['Celsius'], owner: {company: 'Celsius Holdings', ticker: 'CELH', listing: 'us'}, wikipedia: ['Celsius']},
    {id: 'prime', name: 'Prime', category: 'drinks', aliases: ['Prime Hydration'], owner: null, wikipedia: ['Prime']},
];

const entity = (key: string, weightSlow: number, sentimentSlow = 0, thesis = false): CultureEntitySummary => ({
    key, displayName: key, category: 'drinks', ticker: null, listing: null,
    weightFast: weightSlow / 2, weightSlow, sentimentFast: sentimentSlow, sentimentSlow,
    thesisSince: thesis ? 1 : null, lastSeenAt: 1,
});

describe('rollupTickers', () => {
    it('sums and maxes an owner over its brands, averages sentiment by weight, counts theses', () => {
        const rollups = rollupTickers([entity('gatorade', 4, 0.5, true), entity('poppi', 1, -0.5), entity('celsius', 3, 0.2), entity('prime', 9)], CATALOG);
        expect(rollups.map((r) => r.ticker)).toEqual(['PEP', 'CELH']);
        const pep = rollups[0];
        expect(pep.company).toBe('PepsiCo');
        expect(pep.weightSlowSum).toBe(5);
        expect(pep.weightSlowMax).toBe(4);
        expect(pep.weightFastSum).toBe(2.5);
        expect(pep.sentimentSlow).toBeCloseTo((0.5 * 4 - 0.5 * 1) / 5, 9);
        expect(pep.thesisCount).toBe(1);
        expect(pep.brands.map((b) => b.id)).toEqual(['gatorade', 'poppi', 'doritos']);
        expect(pep.brands[2]).toMatchObject({weightSlow: 0, thesis: false});
    });

    it('leaves private brands out and gives an owner with no weight a zero sentiment', () => {
        const rollups = rollupTickers([entity('prime', 9)], CATALOG);
        expect(rollups.every((r) => r.ticker !== 'PRIME')).toBe(true);
        expect(rollups.find((r) => r.ticker === 'CELH')).toMatchObject({weightSlowSum: 0, sentimentSlow: 0, thesisCount: 0});
        expect(rollups.map((r) => r.ticker)).toEqual(['CELH', 'PEP']);
    });
});
