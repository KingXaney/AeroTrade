import {describe, expect, it} from 'vitest';
import {runWithToast, UNREACHABLE_MESSAGE} from '@/lib/action-toast';

const recorder = () => {
    const calls: [string, string][] = [];
    return {calls, toaster: {success: (m: string) => calls.push(['success', m]), error: (m: string) => calls.push(['error', m])}};
};

const FALLBACKS = {success: 'Done', error: 'Something went wrong'};

describe('runWithToast', () => {
    it('toasts the action\'s own message and reports success', async () => {
        const {calls, toaster} = recorder();
        expect(await runWithToast(async () => ({success: true, message: 'Queued'}), toaster, FALLBACKS)).toBe(true);
        expect(calls).toEqual([['success', 'Queued']]);
    });

    it('toasts a refusal as an error, falling back when the action gave no message', async () => {
        const {calls, toaster} = recorder();
        expect(await runWithToast(async () => ({success: false}), toaster, FALLBACKS)).toBe(false);
        expect(calls).toEqual([['error', 'Something went wrong']]);
    });

    it('turns a thrown call into an error toast instead of an unhandled rejection', async () => {
        const {calls, toaster} = recorder();
        const thrown = runWithToast(async () => { throw new TypeError('Failed to fetch'); }, toaster, FALLBACKS);
        await expect(thrown).resolves.toBe(false);
        expect(calls).toEqual([['error', UNREACHABLE_MESSAGE]]);
    });
});
