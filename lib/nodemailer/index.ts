import nodemailer from 'nodemailer';
import {WELCOME_EMAIL_TEMPLATE, NEWS_SUMMARY_EMAIL_TEMPLATE} from "@/lib/nodemailer/templates";

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
const escapeHtml = (value: string): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData) => {
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replace('{{name}}', () => escapeHtml(name))
        // intro is deliberately HTML — sanitizeWelcomeIntroHtml has already rebuilt it.
        .replace('{{intro}}', () => intro);

    const mailOptions = {
        from: `"AlgoTest" <algotestadvisor@gmail.com>`,
        to: email,
        subject: `Welcome to AlgoTest - your stock market toolkit is ready!`,
        text: 'Thanks for joining AlgoTest',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

export const sendNewsSummaryEmail = async (
    { email, date, newsContent }: { email: string; date: string; newsContent: string }
): Promise<void> => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', () => escapeHtml(date))
        // newsContent is deliberately HTML — sanitizeDigestHtml has already run on it.
        .replace('{{newsContent}}', () => newsContent);

    const mailOptions = {
        from: `"AlgoTest News" <algotestadvisor@gmail.com>`,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from AlgoTest`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
};