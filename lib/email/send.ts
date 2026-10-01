import nodemailer from 'nodemailer';
import {escapeHtml} from "@/lib/news/sanitize";
import {WELCOME_EMAIL_TEMPLATE, PASSWORD_RESET_EMAIL_TEMPLATE, renderNewsSummaryEmail} from "@/lib/email/templates";

type WelcomeEmailData = {
    email: string;
    name: string;
    intro: string;
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

// Absolute links in email need the deployment's public URL (the same one better-auth uses).
export const appUrl = (): string => (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '') || 'http://localhost:3000';

const mailerConfigured = (): boolean => Boolean(process.env.NODEMAILER_EMAIL && process.env.NODEMAILER_PASSWORD);

// Dev and the QA harness have no Gmail credentials, and an unconfigured transport rejects inside
// whichever Inngest step called it, to be retried. So every sender — and every job, before it
// pays for a model call to write the email — asks here first, and an unconfigured mailer costs
// one log line: an error in production, a warning elsewhere. `devDetail` (the reset link) is
// printed only outside production, which keeps the flow testable locally without leaking it.
export const mailerReady = (what: string, devDetail?: string): boolean => {
    if (mailerConfigured()) return true;
    if (process.env.NODE_ENV === 'production') console.error(`[mailer] NODEMAILER_EMAIL/PASSWORD unset — ${what} not sent`);
    else console.warn(`[mailer] NODEMAILER_EMAIL/PASSWORD unset — ${what} not sent${devDetail ? `: ${devDetail}` : ''}`);
    return false;
};

const PASSWORD_RESET_TTL_MINUTES = 30;

// Everything the senders below interpolate into their templates becomes HTML in an email sent
// from this product's own address. `name` comes straight from an unverified signup form and the
// recipient is whatever address that form was given, so without escaping a signup is enough to
// mail arbitrary markup — a phishing link, say — to anyone. Replacer functions rather than
// replacement strings: '$&' in a name would otherwise be expanded by String.replace.

// The token lands in an href: URL-encode it first, then HTML-escape the whole URL.
export const sendPasswordResetEmail = async ({ email, name, token }: { email: string; name?: string | null; token: string }): Promise<void> => {
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    if (!mailerReady('the password reset email', `link for ${email}: ${resetUrl}`)) return;
    const htmlTemplate = PASSWORD_RESET_EMAIL_TEMPLATE
        .replaceAll('{{appUrl}}', () => appUrl())
        .replace('{{name}}', () => escapeHtml(name?.trim() || 'there'))
        .replaceAll('{{resetUrl}}', () => escapeHtml(resetUrl))
        .replaceAll('{{ttl}}', () => String(PASSWORD_RESET_TTL_MINUTES));

    await transporter.sendMail({
        from: `"AeroTrade" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: 'Reset your AeroTrade password',
        text: `Reset your AeroTrade password: ${resetUrl}\n\nThe link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes. If you didn't ask for this, ignore this email — your password stays as it is.`,
        html: htmlTemplate,
    });
};

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData): Promise<void> => {
    if (!mailerReady('the welcome email')) return;
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replaceAll('{{appUrl}}', () => appUrl())
        .replace('{{name}}', () => escapeHtml(name))
        // intro is deliberately HTML — sanitizeWelcomeIntroHtml has already rebuilt it.
        .replace('{{intro}}', () => intro);

    const mailOptions = {
        from: `"AeroTrade" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: `Welcome to AeroTrade — your trading terminal is ready`,
        text: 'Thanks for joining AeroTrade',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

// The daily digest's date line and subject date, e.g. "Thursday, October 1, 2026" — the ET day,
// like every other date the app prints.
export const getFormattedTodayDate = () => new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
});

export const sendNewsSummaryEmail = async (
    { email, date, newsContent, topicsSection = '', lessonSection = '' }: { email: string; date: string; newsContent: string; topicsSection?: string; lessonSection?: string }
): Promise<void> => {
    if (!mailerReady('the daily news summary')) return;
    const htmlTemplate = renderNewsSummaryEmail({appUrl: appUrl(), date, newsContent, topicsSection, lessonSection});

    const mailOptions = {
        from: `"AeroTrade News" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from AeroTrade`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
};