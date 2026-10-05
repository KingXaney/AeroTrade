// Every sender asks mailerReady first: with no Gmail credentials nothing reaches nodemailer (whose
// transport would otherwise reject inside an Inngest step and be retried), and the skip is one log
// line — an error in production, a warning elsewhere, the reset link only outside production.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {sendMail} = vi.hoisted(() => ({sendMail: vi.fn()}));
vi.mock('nodemailer', () => ({default: {createTransport: () => ({sendMail})}}));

import {mailerReady, sendNewsSummaryEmail, sendPasswordResetEmail, sendWelcomeEmail} from '@/lib/email/send';

const senders = {
    'password reset': () => sendPasswordResetEmail({email: 'a@b.co', name: 'Ada', token: 'secret-token'}),
    welcome: () => sendWelcomeEmail({email: 'a@b.co', name: 'Ada', intro: '<p>Hi</p>'}),
    digest: () => sendNewsSummaryEmail({email: 'a@b.co', subject: 'AeroTrade daily brief · Oct 1', html: '<p>News</p>', text: 'News'}),
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

    // A preview build shares production's mailer and every reader's address: it never sends.
    for (const [name, send] of Object.entries(senders)) {
        it(`never sends the ${name} email from a preview build, even with the mailer configured`, async () => {
            vi.stubEnv('NODEMAILER_EMAIL', 'news@example.com');
            vi.stubEnv('NODEMAILER_PASSWORD', 'app-password');
            vi.stubEnv('VERCEL_ENV', 'preview');
            await send();
            expect(sendMail).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain('preview build');
        });
    }

    it('sends as AeroTrade, with production links in production', async () => {
        vi.stubEnv('NODEMAILER_EMAIL', 'news@example.com');
        vi.stubEnv('NODEMAILER_PASSWORD', 'app-password');
        vi.stubEnv('VERCEL_ENV', 'production');
        vi.stubEnv('BETTER_AUTH_URL', 'https://retired.example.app');
        await senders['password reset']();
        const mail = sendMail.mock.calls[0][0];
        expect(mail.from).toBe('"AeroTrade" <news@example.com>');
        expect(mail.html).toContain('https://aerotrading.vercel.app/reset-password?token=secret-token');
        expect(mail.html).not.toContain('retired.example.app');
        expect(mail.text).toContain('https://aerotrading.vercel.app/reset-password?token=secret-token');
    });

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
