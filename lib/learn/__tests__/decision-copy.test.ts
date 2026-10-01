// Copy for the strategy page's "Latest decision" panel: every line it adds around what the run
// stored is held to the 'copy' tier of lib/learn/banned.ts, on a grid of the values the job
// writes, and renders exactly the text the panel showed when the prose was inline.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {DECISION_COPY} from '@/lib/learn/copy/decision';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

// What lib/strategies writes: rebalance.ts's skip reasons, the order kinds, the order path's
// messages and the job's summaries.
const SKIP_REASONS = ['stale', 'duplicate target', 'below one share', 'unpriced', 'stale target', 'unpriced target', 'cash floor'];
const KINDS = ['enter', 'add', 'trim', 'exit'] as const;
const MODES = ['live', 'preview', 'skipped'] as const;
const SUMMARIES = ['1/1 order(s) filled', '0 orders', 'Skipped — 7 of 11 symbols are stale'];

describe('DECISION_COPY', () => {
    it('frames every run, order and skipped order without advice', () => {
        const {mode, runLine, orderSize, outcome, skipped, ...fixed} = DECISION_COPY;
        for (const text of Object.values(fixed)) clean(text);
        for (const label of Object.values(mode)) clean(label);
        for (const summary of SUMMARIES) clean(runLine('2026-09-30', '2026-09-29', summary));
        for (const kind of KINDS) for (const quantity of [1, 2, 40]) clean(orderSize(quantity, kind));
        for (const runMode of MODES) {
            for (const order of [
                {executed: true, price: 500, message: null},
                {executed: true, price: null, message: null},
                {executed: false, price: null, message: null},
                {executed: false, price: null, message: 'Insufficient cash for this order'},
            ]) clean(outcome(order, runMode));
        }
        for (const reason of SKIP_REASONS) clean(skipped('XLE', reason));
    });

    it('renders the text the panel always showed', () => {
        expect(DECISION_COPY.emptyTitle).toBe('No decisions yet.');
        expect(DECISION_COPY.emptyDescription).toBe('The first run happens on the next trading morning.');
        expect(DECISION_COPY.mode).toEqual({live: 'Live run', preview: 'Preview — nothing traded', skipped: 'Skipped'});
        expect(DECISION_COPY.runLine('2026-09-30', '2026-09-29', '1/1 order(s) filled')).toBe('2026-09-30 · from the 2026-09-29 close · 1/1 order(s) filled');
        expect(DECISION_COPY.rebalanced).toBe('· rule evaluated its allocation today');
        expect(DECISION_COPY.noOrders).toBe('Nothing to do — the rule held its positions.');
        expect(DECISION_COPY.orderSize(1, 'enter')).toBe('1 share · enter');
        expect(DECISION_COPY.orderSize(40, 'trim')).toBe('40 shares · trim');
        expect(DECISION_COPY.skipped('XLE', 'stale')).toBe('XLE: stale');
        expect(DECISION_COPY.watching).toBe('What it is watching');
    });

    it('states an order\'s outcome: its fill price, or why it did not fill', () => {
        const {outcome} = DECISION_COPY;
        expect(outcome({executed: true, price: 500, message: null}, 'live')).toBe('filled @ $500.00');
        expect(outcome({executed: true, price: 1234.5, message: null}, 'live')).toBe('filled @ $1,234.50');
        expect(outcome({executed: true, price: null, message: null}, 'live')).toBe('filled');
        expect(outcome({executed: false, price: null, message: 'Insufficient cash'}, 'preview')).toBe('not filled (preview)');
        expect(outcome({executed: false, price: null, message: 'Insufficient cash'}, 'live')).toBe('not filled — Insufficient cash');
        expect(outcome({executed: false, price: null, message: null}, 'live')).toBe('not filled');
        expect(outcome({executed: false, price: null, message: ''}, 'skipped')).toBe('not filled');
    });
});
