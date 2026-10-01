// Every sender asks mailerReady first: with no Gmail credentials nothing reaches nodemailer (whose
// transport would otherwise reject inside an Inngest step and be retried), and the skip is one log
// line — an error in production, a warning elsewhere, the reset link only outside production.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {sendMail} = vi.hoisted(() => ({sendMail: vi.fn()}));
vi.mock('nodemailer', () => ({default: {createTransport: () => ({sendMail})}}));

import {mailerReady, sendNewsSummaryEmail, sendPasswordResetEmail, sendWelcomeEmail} from '@/lib/nodemailer';

const senders = {
    'password reset': () => sendPasswordResetEmail({email: 'a@b.co', name: 'Ada', token: 'secret-token'}),
    welcome: () => sendWelcomeEmail({email: 'a@b.co', name: 'Ada', intro: '<p>Hi</p>'}),
    digest: () => sendNewsSummaryEmail({email: 'a@b.co', date: 'Thursday, October 1, 2026', newsContent: '<p>News</p>'}),
};

describe('the mailer guard', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        sendMail.mockReset();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubEnv('NODEMAILER_EMAIL', '');
        vi.stubEnv('NODEMAILER_PASSWORD', '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    for (const [name, send] of Object.entries(senders)) {
        it(`skips the ${name} email with one warning when the mailer is unconfigured`, async () => {
            await expect(send()).resolves.toBeUndefined();
            expect(sendMail).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(error).not.toHaveBeenCalled();
        });

        it(`logs the skipped ${name} email as an error in production`, async () => {
            vi.stubEnv('NODE_ENV', 'production');
            await send();
            expect(sendMail).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledTimes(1);
            expect(warn).not.toHaveBeenCalled();
            expect(String(error.mock.calls[0][0])).not.toContain('secret-token');
        });

        it(`sends the ${name} email once the mailer is configured`, async () => {
            vi.stubEnv('NODEMAILER_EMAIL', 'news@example.com');
            vi.stubEnv('NODEMAILER_PASSWORD', 'app-password');
            await send();
            expect(sendMail).toHaveBeenCalledTimes(1);
            expect(warn).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        });
    }

    it('keeps the reset link in the warning outside production, so the flow stays testable locally', async () => {
        await senders['password reset']();
        expect(String(warn.mock.calls[0][0])).toContain('/reset-password?token=secret-token');
    });

    it('answers for the jobs too: false with one line when unconfigured, true and silent when configured', () => {
        expect(mailerReady('the daily news summary')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('the daily news summary');
        vi.stubEnv('NODEMAILER_EMAIL', 'news@example.com');
        vi.stubEnv('NODEMAILER_PASSWORD', 'app-password');
        expect(mailerReady('the daily news summary')).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
