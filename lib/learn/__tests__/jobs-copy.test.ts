// The status strip's line for a failed job.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {JOB_STAMP_COPY} from '@/lib/learn/copy/jobs';

describe('the job strip copy', () => {
    it('says when a job failed and quotes its error', () => {
        const line = JOB_STAMP_COPY.failed('2h ago', 'Server selection timed out');
        expect(line).toBe('failed 2h ago: Server selection timed out');
        expect(findBanned(line, 'copy')).toEqual([]);
    });
});
