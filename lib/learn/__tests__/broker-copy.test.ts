// The Alpaca link's sentences: the copy tier everywhere, and the summary lines the syncs record.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {BROKER_COPY} from '@/lib/learn/copy/broker';

const clean = (text: string) => expect(findBanned(text, 'copy'), text).toEqual([]);

describe('BROKER_COPY', () => {
    it('holds every sentence to the copy tier', () => {
        const samples: Record<string, unknown[]> = {
            accountLine: ['1234', 'ACTIVE'], unreachable: ['HTTP 401 unauthorized'], linkedLine: ['AI Navigator', '2026-10-24'], tradedBy: ['the AI Navigator'],
            noteBlocked: ['ACCOUNT_CLOSED'], summary: [{kind: 'executed', planned: 3, sent: 2, failed: 1, skipped: 1}], jobLine: [1, ['Alpaca mirror: 2 orders sent']],
        };
        for (const [name, value] of Object.entries(BROKER_COPY)) {
            if (typeof value === 'string') clean(value);
            else if (typeof value === 'function') {
                expect(samples, `no sample for ${name}`).toHaveProperty(name);
                clean((value as (...a: unknown[]) => string)(...samples[name]));
            } else Object.values(value as Record<string, string>).forEach(clean);
        }
    });

    it('says what a sync did, in one line', () => {
        expect(BROKER_COPY.summary({kind: 'executed', planned: 3, sent: 3})).toBe('Alpaca mirror: 3 orders sent');
        expect(BROKER_COPY.summary({kind: 'executed', planned: 3, sent: 2, failed: 1, skipped: 1})).toBe('Alpaca mirror: 2 orders sent, 1 refused; 1 symbol left out');
        expect(BROKER_COPY.summary({kind: 'preview', planned: 1, note: 'the market is closed'})).toBe('Alpaca mirror: 1 order planned, none sent (the market is closed)');
        expect(BROKER_COPY.summary({kind: 'executed', planned: 0})).toBe('Alpaca mirror: in line with the paper account, nothing to send');
        expect(BROKER_COPY.summary({kind: 'skipped', note: 'no Alpaca keys on the server'})).toBe('Alpaca mirror skipped: no Alpaca keys on the server');
        expect(BROKER_COPY.jobLine(0, [])).toBe('Broker mirror: no active link');
        expect(BROKER_COPY.accountLine('9F2A', 'ACTIVE')).toBe('Account ••••9F2A · active');
    });

    it('states the rails from the config', () => {
        expect(BROKER_COPY.schedule).toMatch(/under \$25 or 2% of equity/);
        expect(BROKER_COPY.schedule).toMatch(/at most 20 orders a sync/);
    });
});
