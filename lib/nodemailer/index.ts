import nodemailer from 'nodemailer';
import {escapeHtml} from "@/lib/news/sanitize";
import {WELCOME_EMAIL_TEMPLATE, NEWS_SUMMARY_EMAIL_TEMPLATE, PASSWORD_RESET_EMAIL_TEMPLATE} from "@/lib/nodemailer/templates";

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

// Everything interpolated into these templates becomes HTML in an email sent from
// this product's own address. `name` comes straight from an unverified signup form
// and the recipient is whatever address that form was given, so without escaping a
// signup is enough to mail arbitrary markup — a phishing link, say — to anyone.
// Replacer functions rather than replacement strings: '$&' in a name would otherwise
// be expanded by String.replace.

// Absolute links in email need the deployment's public URL (the same one better-auth uses).
const appUrl = () => (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '') || 'http://localhost:3000';

export const mailerConfigured = (): boolean => Boolean(process.env.NODEMAILER_EMAIL && process.env.NODEMAILER_PASSWORD);

export const PASSWORD_RESET_TTL_MINUTES = 30;

// The token lands in an href: URL-encode it first, then HTML-escape the whole URL.
export const sendPasswordResetEmail = async ({ email, name, token }: { email: string; name?: string | null; token: string }): Promise<void> => {
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    if (!mailerConfigured()) {
        // Dev and the QA harness have no Gmail credentials. The flow stays testable
        // locally; in production a missing mailer is logged without leaking the token.
        if (process.env.NODE_ENV === 'production') console.error('[mailer] NODEMAILER_EMAIL/PASSWORD unset — a password reset email could not be sent');
        else console.warn(`[mailer] NODEMAILER_EMAIL/PASSWORD unset — password reset link for ${email}: ${resetUrl}`);
        return;
    }
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

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData) => {
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

export const sendNewsSummaryEmail = async (
    { email, date, newsContent, topicsSection = '' }: { email: string; date: string; newsContent: string; topicsSection?: string }
): Promise<void> => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replaceAll('{{appUrl}}', () => appUrl())
        .replace('{{date}}', () => escapeHtml(date))
        // newsContent and topicsSection are deliberately HTML — sanitizeDigestHtml has already run on them.
        .replace('{{newsContent}}', () => newsContent)
        .replace('{{topicsSection}}', () => topicsSection);

    const mailOptions = {
        from: `"AeroTrade News" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from AeroTrade`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
};