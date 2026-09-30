// Copy for the strategy page's CSV export link: held to the 'copy' tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {EXPORT_COPY} from '@/lib/learn/copy/export';
import {STRATEGIES} from '@/lib/strategies/catalog';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('EXPORT_COPY', () => {
    it('labels the link and describes the file for every strategy without advice', () => {
        clean(EXPORT_COPY.label);
        for (const def of STRATEGIES) clean(EXPORT_COPY.strategyTitle(def.name));
    });

    it('says what the file holds', () => {
        expect(EXPORT_COPY.label).toBe('Export CSV');
        expect(EXPORT_COPY.strategyTitle('Golden Cross Sectors'))
            .toBe('Every live fill of Golden Cross Sectors since its account opened, one row per fill, as a CSV file');
    });
});
