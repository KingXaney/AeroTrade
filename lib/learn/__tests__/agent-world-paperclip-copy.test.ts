// Every sentence the trading agent world writes into its Paperclip company, held to the copy tier:
// the board shows them to whoever opens it, so they describe what the desk did with its own paper
// account and never tell anyone what to do.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {PAPERCLIP_COPY} from '@/lib/learn/copy/agent-world-paperclip';

const clean = (text: string) => {
    expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const SAMPLES: Record<string, unknown[][]> = {
    list: [[['AAPL', 'MSFT', 'NVDA']], [['AAPL']], [[]]],
    symbols: [[1], [3]],
    weeklyTitle: [['2026-10-26', 3], ['2026-10-26', 1]],
    manualTitle: [['2026-10-27', 3]],
    previewTitle: [['2026-10-27', 10]],
    descriptionLead: [['aw-2026-10-26', 'AAPL, MSFT and NVDA']],
    approvedBy: [['owner@example.com']],
    declinedBy: [['owner@example.com']],
    fillLine: [[false, 10, 'AAPL', '$150.00'], [true, 5, 'MSFT', null], [true, 1_250, 'NVDA', '$1,201.50']],
    filled: [['bought 10 AAPL at $150.00 and sold 5 MSFT']],
    missedLine: [['NVDA', false, 3, 'no live price'], ['MSFT', true, 1, null]],
    missed: [[1, 'NVDA, 3 shares to buy (no live price)'], [2, 'AAPL, 10 shares to buy; MSFT, 1 share to sell']],
    blocked: [['service refused (HTTP 503)'], ['no answer from the service in 48m']],
};

// Every string, and every function on each of its samples.
const rendered = (): string[] =>
    Object.entries(PAPERCLIP_COPY).flatMap(([name, value]) => {
        if (typeof value === 'string') return [value];
        expect(SAMPLES, `no sample for ${name}`).toHaveProperty(name);
        return SAMPLES[name].map((args) => (value as (...a: unknown[]) => string)(...args));
    });

describe('PAPERCLIP_COPY', () => {
    it('holds every string and every rendered line to the copy tier', () => {
        const texts = rendered();
        expect(texts.length).toBeGreaterThan(20);
        for (const text of texts) clean(text);
    });

    it('has a sample for every function and a function for every sample', () => {
        const functions = Object.entries(PAPERCLIP_COPY).filter(([, value]) => typeof value === 'function').map(([name]) => name).sort();
        expect(Object.keys(SAMPLES).sort()).toEqual(functions);
    });

    it('ends every sentence with a full stop and opens none on a side of an order', () => {
        for (const [name, value] of Object.entries(PAPERCLIP_COPY)) {
            if (typeof value !== 'string') continue;
            expect(value.endsWith('.'), name).toBe(true);
            expect(value, name).not.toMatch(/^(buy|sell|hold|avoid|trim|dump)\b/i);
        }
        for (const args of SAMPLES.fillLine) {
            expect(PAPERCLIP_COPY.filled((PAPERCLIP_COPY.fillLine as (...a: unknown[]) => string)(...args))).toMatch(/^The paper account (bought|sold) /);
        }
    });

    it('composes the lines the company shows', () => {
        expect(PAPERCLIP_COPY.weeklyTitle('2026-10-26', 3)).toBe('Week of 2026-10-26: 3 symbols');
        expect(PAPERCLIP_COPY.list(['AAPL', 'MSFT', 'NVDA'])).toBe('AAPL, MSFT and NVDA');
        expect(PAPERCLIP_COPY.list(['AAPL', 'MSFT'])).toBe('AAPL and MSFT');
        expect(PAPERCLIP_COPY.fillLine(true, 1_250, 'NVDA', '$1,201.50')).toBe('sold 1,250 NVDA at $1,201.50');
        expect(PAPERCLIP_COPY.missedLine('NVDA', false, 3, 'no live price')).toBe('NVDA, 3 shares to buy (no live price)');
        expect(PAPERCLIP_COPY.approvedBy('owner@example.com')).toBe('Approved by owner@example.com on AeroTrade.');
    });
});
