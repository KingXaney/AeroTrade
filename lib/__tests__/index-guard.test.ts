// The index guard: one attempt shared, a failure forgotten, never a throw.

import {describe, expect, it, vi} from 'vitest';
import {indexGuard} from '@/database/index-guard';

describe('indexGuard', () => {
    it('builds once however many callers wait, and answers true', async () => {
        const createIndexes = vi.fn().mockResolvedValue(undefined);
        const indexed = indexGuard({modelName: 'Thing', createIndexes});
        expect(await Promise.all([indexed(), indexed(), indexed()])).toEqual([true, true, true]);
        expect(await indexed()).toBe(true);
        expect(createIndexes).toHaveBeenCalledTimes(1);
    });

    it('answers false on a failure, and tries again on the next call', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const createIndexes = vi.fn().mockRejectedValueOnce(new Error('not connected')).mockResolvedValue(undefined);
        const indexed = indexGuard({modelName: 'Thing', createIndexes});
        expect(await indexed()).toBe(false);
        expect(await indexed()).toBe(true);
        expect(createIndexes).toHaveBeenCalledTimes(2);
        quiet.mockRestore();
    });
});
