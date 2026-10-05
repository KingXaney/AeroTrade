import nodemailer from 'nodemailer';
import {renderPasswordResetEmail, renderWelcomeEmail} from "@/lib/email/templates";
import {RESET_EMAIL_COPY, WELCOME_EMAIL_COPY} from "@/lib/learn/copy/email";
import {isPreviewBuild, SITE_NAME, siteUrl} from "@/lib/site";

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

// Absolute links in email: the production domain in production, the app's own address
// elsewhere (lib/site.ts).
export const appUrl = (): string => siteUrl();

// The sender: the product's name before whatever address the mailer is configured with.
const from = (): string => `"${SITE_NAME}" <${process.env.NODEMAILER_EMAIL}>`;

const mailerConfigured = (): boolean => Boolean(process.env.NODEMAILER_EMAIL && process.env.NODEMAILER_PASSWORD);

// Dev and the QA harness have no Gmail credentials, and an unconfigured transport rejects inside
// whichever Inngest step called it, to be retried. So every sender — and every job, before it
// pays for a model call to write the email — asks here first, and an unconfigured mailer costs
// one log line: an error in production, a warning elsewhere. `devDetail` (the reset link) is
// printed only outside production, which keeps the flow testable locally without leaking it.
//
// A preview build never sends: it shares production's mailer and database, and the Inngest
// integration runs its jobs in a branch environment of its own, so its mail would reach every
// real reader a second time.
export const mailerReady = (what: string, devDetail?: string): boolean => {
    if (isPreviewBuild()) {
        console.warn(`[mailer] preview build — ${what} not sent`);
        return false;
    }
    if (mailerConfigured()) return true;
    if (process.env.NODE_ENV === 'production') console.error(`[mailer] NODEMAILER_EMAIL/PASSWORD unset — ${what} not sent`);
    else console.warn(`[mailer] NODEMAILER_EMAIL/PASSWORD unset — ${what} not sent${devDetail ? `: ${devDetail}` : ''}`);
    return false;
};

const PASSWORD_RESET_TTL_MINUTES = 30;

// Everything the senders below put into an email becomes HTML sent from this product's own
// address. `name` comes straight from an unverified signup form and the recipient is whatever
// address that form was given, so without escaping a signup is enough to mail arbitrary markup —
// a phishing link, say — to anyone. The renderers (lib/email/templates.ts) escape every text
// argument; the reset token is URL-encoded into its link first.
export const sendPasswordResetEmail = async ({ email, name, token }: { email: string; name?: string | null; token: string }): Promise<void> => {
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    if (!mailerReady('the password reset email', `link for ${email}: ${resetUrl}`)) return;
    await transporter.sendMail({
        from: from(),
        to: email,
        subject: RESET_EMAIL_COPY.subject,
        text: RESET_EMAIL_COPY.text(resetUrl, PASSWORD_RESET_TTL_MINUTES),
        html: renderPasswordResetEmail({appUrl: appUrl(), name: name?.trim() || 'there', resetUrl, minutes: PASSWORD_RESET_TTL_MINUTES}),
    });
};

// `intro` is inline HTML that sanitizeWelcomeIntroHtml has already reduced to text and emphasis.
export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData): Promise<void> => {
    if (!mailerReady('the welcome email')) return;
    await transporter.sendMail({
        from: from(),
        to: email,
        subject: WELCOME_EMAIL_COPY.subject,
        text: WELCOME_EMAIL_COPY.text(`${appUrl()}/`),
        html: renderWelcomeEmail({appUrl: appUrl(), name, introHtml: intro}),
    });
}

// The daily brief, already composed (lib/email/digest.ts): its subject, HTML and plain text.
export const sendNewsSummaryEmail = async (
    {email, subject, html, text}: {email: string; subject: string; html: string; text: string}
): Promise<void> => {
    if (!mailerReady('the daily news summary')) return;
    await transporter.sendMail({from: from(), to: email, subject, text, html});
};
