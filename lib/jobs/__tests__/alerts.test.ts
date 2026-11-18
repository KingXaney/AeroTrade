// The owner's alert: which job a failed function is, which jobs are overdue, and the error line.

import {describe, expect, it} from 'vitest';
import {ERROR_LINE_MAX, errorLine, jobOfFunctionId, overdueJobs, type StampedJob} from '@/lib/jobs/alerts';
import {JOB_LIST} from '@/lib/jobs/registry';

describe('jobOfFunctionId', () => {
    it('reads the job out of Inngest\'s name for the function', () => {
        expect(jobOfFunctionId('aerotrade-daily-account-snapshots')?.id).toBe('daily-account-snapshots');
        expect(jobOfFunctionId('daily-account-snapshots')?.id).toBe('daily-account-snapshots');
    });

    it('finds every registered job under the app\'s prefix', () => {
        for (const job of JOB_LIST) expect(jobOfFunctionId(`aerotrade-${job.id}`)?.id, job.id).toBe(job.id);
    });

    it('is nothing for a function the registry does not list', () => {
        expect(jobOfFunctionId('aerotrade-something-else')).toBeNull();
        expect(jobOfFunctionId('')).toBeNull();
        expect(jobOfFunctionId('account-snapshots')).toBeNull();
    });
});

describe('overdueJobs', () => {
    const HOUR = 3_600_000;
    const now = 1_800_000_000_000;
    const job = (over: Partial<StampedJob>): StampedJob => ({jobId: 'j', label: 'J', schedule: 'daily', lastRunAt: now - HOUR, staleAfterHours: 30, ...over});

    it('names a job whose last completed run is older than its allowance', () => {
        expect(overdueJobs([job({jobId: 'late', lastRunAt: now - 31 * HOUR}), job({jobId: 'fine', lastRunAt: now - 29 * HOUR})], now).map((j) => j.jobId)).toEqual(['late']);
    });

    it('leaves out a job that never ran and an on-demand one', () => {
        expect(overdueJobs([job({lastRunAt: null}), job({lastRunAt: now - 9999 * HOUR, staleAfterHours: Number.POSITIVE_INFINITY})], now)).toEqual([]);
    });
});

describe('errorLine', () => {
    it('is one line, bounded', () => {
        expect(errorLine('first\nsecond\tthird')).toBe('first second third');
        expect(errorLine('x'.repeat(1000))).toHaveLength(ERROR_LINE_MAX);
        expect(errorLine('x'.repeat(1000)).endsWith('…')).toBe(true);
    });

    it('says so when there is nothing to quote', () => {
        expect(errorLine('')).toBe('no error message');
        expect(errorLine(undefined)).toBe('no error message');
    });
});
