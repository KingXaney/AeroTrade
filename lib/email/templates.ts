// The welcome and password-reset emails, on the shared frame (lib/email/layout.ts) (pure). The
// daily brief has its own view and renderer (lib/email/digest-view.ts, digest-render.ts). Every
// sentence is lib/learn/copy/email; the only inline HTML a caller hands in is the welcome intro,
// which lib/news/sanitize.sanitizeWelcomeIntroHtml has already reduced to text and <strong>/<em>.

import {bulletList, button, hero, linkOrText, paragraph, paragraphHtml, renderEmail} from "@/lib/email/layout";
import {escapeHtml} from "@/lib/news/sanitize";
import {EMAIL_FOOTER_COPY, RESET_EMAIL_COPY, WELCOME_EMAIL_COPY} from "@/lib/learn/copy/email";

const base = (appUrl: string): string => String(appUrl ?? '').replace(/\/+$/, '');

export const renderWelcomeEmail = ({appUrl, name, introHtml}: {appUrl: string; name: string; introHtml: string}): string => {
    const root = base(appUrl);
    return renderEmail({
        title: WELCOME_EMAIL_COPY.title,
        preheader: WELCOME_EMAIL_COPY.preheader,
        bodyHtml: [
            hero(WELCOME_EMAIL_COPY.hero(name)),
            introHtml ? paragraphHtml(introHtml) : '',
            paragraphHtml(`<strong>${escapeHtml(WELCOME_EMAIL_COPY.featuresLead)}</strong>`),
            bulletList(WELCOME_EMAIL_COPY.features.map((feature) => escapeHtml(feature))),
            paragraph(WELCOME_EMAIL_COPY.digestNote, 'muted'),
            button(`${root}/`, WELCOME_EMAIL_COPY.cta),
        ].join(''),
        footerLinks: [
            {label: EMAIL_FOOTER_COPY.openApp, url: `${root}/`},
            {label: EMAIL_FOOTER_COPY.preferences, url: `${root}/settings#notifications`},
        ],
        footerLines: [EMAIL_FOOTER_COPY.accountWhy, EMAIL_FOOTER_COPY.paperNote, EMAIL_FOOTER_COPY.copyright],
    });
};

// The link is the whole point, so it is repeated in plain text for clients that strip buttons.
export const renderPasswordResetEmail = ({appUrl, name, resetUrl, minutes}: {appUrl: string; name: string; resetUrl: string; minutes: number}): string =>
    renderEmail({
        title: RESET_EMAIL_COPY.title,
        preheader: RESET_EMAIL_COPY.preheader(minutes),
        bodyHtml: [
            hero(RESET_EMAIL_COPY.hero),
            paragraph(RESET_EMAIL_COPY.body(name, minutes)),
            button(resetUrl, RESET_EMAIL_COPY.button),
            paragraphHtml(`${escapeHtml(RESET_EMAIL_COPY.pasteLead)}<br><span style="word-break: break-all;">${linkOrText(resetUrl, resetUrl)}</span>`, 'small'),
            paragraph(RESET_EMAIL_COPY.notYou, 'muted'),
        ].join(''),
        footerLinks: [{label: EMAIL_FOOTER_COPY.openApp, url: `${base(appUrl)}/`}],
        footerLines: [EMAIL_FOOTER_COPY.accountWhy, EMAIL_FOOTER_COPY.copyright],
    });
