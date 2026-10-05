// Every email's frame and building blocks, in one light design (pure). Email clients ignore most
// CSS, so this is the old way that works everywhere: nested tables, inline styles, no images,
// and a <style> block only for what clients that read one can do better — a phone-width
// padding and Apple Mail's dark mode.
//
// The rules every block follows, so a caller cannot get them wrong:
//   - a `text` argument is escaped here; only arguments named `…Html` pass through, and the
//     caller guarantees those were built by these blocks (or sanitized) already;
//   - an anchor is only ever made by linkOrText, which makes one for an http(s) URL and prints
//     anything else (javascript:, data:, a bare path) as plain text.

import {escapeHtml} from "@/lib/news/sanitize";
import {SITE_NAME} from "@/lib/site";

// The light palette. Links are a dark cyan (5.4:1 on white); the brand cyan is for the
// wordmark on the dark bar, the brand yellow only for thin accents.
export const EMAIL_COLORS = {
    page: '#F3F5F7',
    sheet: '#FFFFFF',
    card: '#F8FAFC',
    line: '#E2E8F0',
    ink: '#0F172A',
    body: '#334155',
    muted: '#64748B',
    link: '#0E7490',
    bar: '#0B1220',
    barText: '#CBD5E1',
    wordmark: '#7DF4FF',
    accent: '#FDD458',
    chip: '#ECFEFF',
    chipLine: '#A5F3FC',
    chipInk: '#155E75',
} as const;

const C = EMAIL_COLORS;
export const EMAIL_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const isHttpUrl = (value: string): boolean => {
    try {
        const {protocol} = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

const LINK_STYLE = `color: ${C.link}; text-decoration: none; font-weight: 600;`;

// The one way an email makes a link. A non-http URL is shown as its label in plain text, so an
// email can never carry a clickable non-web target.
export const linkOrText = (url: string, label: string, style: string = LINK_STYLE): string =>
    isHttpUrl(String(url ?? ''))
        ? `<a href="${escapeHtml(String(url))}" class="em-link" style="${style}">${escapeHtml(label)}</a>`
        : escapeHtml(label);

export type EmailLink = {label: string; url: string};

// --- Blocks ------------------------------------------------------------------------------------

// The page's one big line: the day's headline, the welcome, the reset.
export const hero = (text: string): string =>
    `<h1 class="em-ink em-h1" style="margin: 0 0 12px 0; font-size: 26px; line-height: 1.25; font-weight: 700; color: ${C.ink};">${escapeHtml(text)}</h1>`;

// A section's small capitals label, with a thin yellow rule above it.
export const sectionLabel = (text: string): string =>
    `<h2 class="em-muted" style="margin: 30px 0 12px 0; padding-top: 14px; border-top: 2px solid ${C.accent}; font-size: 12px; line-height: 1.4; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.muted};">${escapeHtml(text)}</h2>`;

// A card's title, optionally a link.
export const cardTitle = (text: string, url?: string): string => {
    const inner = url ? linkOrText(url, text, `color: ${C.ink}; text-decoration: none;`) : escapeHtml(text);
    return `<h3 class="em-ink" style="margin: 0 0 6px 0; font-size: 17px; line-height: 1.35; font-weight: 700; color: ${C.ink};">${inner}</h3>`;
};

export type ParagraphTone = 'body' | 'muted' | 'small';

const PARAGRAPH_STYLE: Record<ParagraphTone, string> = {
    body: `margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: ${C.body};`,
    muted: `margin: 0 0 10px 0; font-size: 14px; line-height: 1.55; color: ${C.muted};`,
    small: `margin: 0 0 8px 0; font-size: 13px; line-height: 1.5; color: ${C.muted};`,
};

const PARAGRAPH_CLASS: Record<ParagraphTone, string> = {body: 'em-body', muted: 'em-muted', small: 'em-muted'};

export const paragraph = (text: string, tone: ParagraphTone = 'body'): string =>
    paragraphHtml(escapeHtml(text), tone);

// A paragraph around inline HTML the caller built or sanitized (links, <strong>).
export const paragraphHtml = (html: string, tone: ParagraphTone = 'body'): string =>
    `<p class="${PARAGRAPH_CLASS[tone]}" style="${PARAGRAPH_STYLE[tone]}">${html}</p>`;

// "Why it matters: …" — a bold lead-in, then the text.
export const leadParagraph = (lead: string, text: string): string =>
    paragraphHtml(`<strong class="em-ink" style="color: ${C.ink};">${escapeHtml(lead)}:</strong> ${escapeHtml(text)}`);

// A list of short items, each inline HTML the caller built.
export const bulletList = (itemsHtml: readonly string[]): string => {
    if (itemsHtml.length === 0) return '';
    const rows = itemsHtml.map((item) =>
        `<tr>` +
        `<td valign="top" style="width: 18px; padding: 2px 0 12px 0; font-size: 15px; line-height: 1.6; color: ${C.accent}; font-weight: 700;">&#9656;</td>` +
        `<td class="em-body" style="padding: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: ${C.body};">${item}</td>` +
        `</tr>`).join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 4px 0;">${rows}</table>`;
};

// Small outlined labels — the reader's own tickers on a story, each a link into the app.
export const chips = (links: readonly EmailLink[]): string => {
    if (links.length === 0) return '';
    const style = `display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; border: 1px solid ${C.chipLine}; border-radius: 999px; background-color: ${C.chip}; font-size: 12px; line-height: 1.5; font-weight: 700; letter-spacing: 0.02em; color: ${C.chipInk}; text-decoration: none;`;
    return `<div style="margin: 0 0 6px 0;">${links.map((l) => linkOrText(l.url, l.label, style)).join('')}</div>`;
};

// "Read more: Reuters ↗ · CNBC ↗" — each a cited article's own link.
export const sourceLine = (lead: string, links: readonly EmailLink[]): string => {
    if (links.length === 0) return '';
    const items = links.map((l) => isHttpUrl(l.url)
        ? `${linkOrText(l.url, l.label, `color: ${C.link}; text-decoration: none; font-weight: 600;`)}&nbsp;&#8599;`
        : escapeHtml(l.label));
    return paragraphHtml(`${escapeHtml(lead)}: ${items.join(' &middot; ')}`, 'small');
};

// The same, inline: outlet links after a bullet.
export const inlineSources = (links: readonly EmailLink[]): string =>
    links.length === 0 ? '' : ` <span class="em-muted" style="font-size: 13px; color: ${C.muted}; white-space: nowrap;">${links.map((l) => linkOrText(l.url, l.label, `color: ${C.link}; text-decoration: none;`)).join(' &middot; ')}</span>`;

// A framed block inside the sheet.
export const card = (innerHtml: string, {accent = false}: {accent?: boolean} = {}): string =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="em-card" style="margin: 0 0 12px 0; border-collapse: separate; background-color: ${C.card}; border: 1px solid ${C.line};${accent ? ` border-left: 3px solid ${C.accent};` : ''} border-radius: 10px;">` +
    `<tr><td style="padding: 16px 18px 8px 18px;">${innerHtml}</td></tr></table>`;

// One call to action, as a filled button that survives clients that drop CSS.
export const button = (url: string, label: string): string => {
    if (!isHttpUrl(url)) return paragraph(label);
    const linkStyle = `display: inline-block; padding: 12px 22px; font-size: 15px; line-height: 1; font-weight: 700; color: ${C.bar}; text-decoration: none; border-radius: 8px;`;
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 22px 0 8px 0;"><tr>` +
        `<td bgcolor="${C.accent}" style="border-radius: 8px; background-color: ${C.accent};">` +
        `<a href="${escapeHtml(url)}" style="${linkStyle}">${escapeHtml(label)}</a>` +
        `</td></tr></table>`;
};

// A two-column table of label/value rows (the AI Navigator's decisions).
export const keyValueRows = (rows: readonly {keyHtml: string; valueHtml: string}[]): string => {
    if (rows.length === 0) return '';
    const body = rows.map((r) =>
        `<tr>` +
        `<td class="em-ink em-rule" style="padding: 6px 12px 6px 0; border-bottom: 1px solid ${C.line}; font-size: 14px; line-height: 1.4; font-weight: 700; color: ${C.ink}; white-space: nowrap;">${r.keyHtml}</td>` +
        `<td class="em-body em-rule" style="padding: 6px 0; border-bottom: 1px solid ${C.line}; font-size: 14px; line-height: 1.4; color: ${C.body};">${r.valueHtml}</td>` +
        `</tr>`).join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 10px 0;">${body}</table>`;
};

// --- The frame ---------------------------------------------------------------------------------

export type EmailFrame = {
    // The document title: some clients show it, screen readers announce it.
    title: string;
    // The inbox preview line after the subject. Hidden in the email itself.
    preheader: string;
    // Small capitals on the right of the bar ("Daily brief"), and the line under the wordmark.
    kicker?: string;
    barLine?: string;
    bodyHtml: string;
    // Footer links, then its plain lines.
    footerLinks: readonly EmailLink[];
    footerLines: readonly string[];
};

// Inbox apps fill the preview with whatever text follows the preheader; these invisible
// characters push the body's first words out of it.
const PREHEADER_SPACER = '&#8199;&#847; '.repeat(40);

const DARK_MODE_CSS = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
        .em-page { background-color: #0B0F14 !important; }
        .em-sheet { background-color: #0F172A !important; border-color: #1E293B !important; }
        .em-card { background-color: #111C2E !important; border-color: #1E293B !important; }
        .em-ink { color: #F1F5F9 !important; }
        .em-body { color: #CBD5E1 !important; }
        .em-muted { color: #94A3B8 !important; }
        .em-link { color: #67E8F9 !important; }
        .em-rule { border-color: #1E293B !important; }
    }
    @media only screen and (max-width: 620px) {
        .em-outer { padding: 12px 6px !important; }
        .em-pad { padding: 22px 18px 6px 18px !important; }
        .em-bar { padding: 16px 18px !important; }
        .em-h1 { font-size: 22px !important; }
    }`;

export const renderEmail = ({title, preheader, kicker, barLine, bodyHtml, footerLinks, footerLines}: EmailFrame): string => {
    const kickerCell = kicker
        ? `<td align="right" valign="middle" style="font-size: 11px; line-height: 1.4; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.barText};">${escapeHtml(kicker)}</td>`
        : '';
    const barLineRow = barLine
        ? `<tr><td colspan="2" style="padding-top: 4px; font-size: 13px; line-height: 1.4; color: ${C.barText};">${escapeHtml(barLine)}</td></tr>`
        : '';
    const footerLinkHtml = footerLinks
        .map((l) => linkOrText(l.url, l.label, `color: ${C.muted}; text-decoration: underline;`))
        .join(' &nbsp;&middot;&nbsp; ');
    const footer = [
        footerLinkHtml ? paragraphHtml(footerLinkHtml, 'small') : '',
        ...footerLines.map((line) => paragraph(line, 'small')),
    ].join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style type="text/css">${DARK_MODE_CSS}
</style>
</head>
<body class="em-page" style="margin: 0; padding: 0; background-color: ${C.page}; font-family: ${EMAIL_FONT}; -webkit-text-size-adjust: 100%;">
<div style="display: none; max-height: 0; max-width: 0; overflow: hidden; opacity: 0; mso-hide: all; font-size: 1px; line-height: 1px; color: ${C.page};">${escapeHtml(preheader)}${PREHEADER_SPACER}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="em-page" style="background-color: ${C.page};">
<tr><td align="center" class="em-outer" style="padding: 28px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; font-family: ${EMAIL_FONT};">
<tr><td class="em-bar" style="padding: 18px 26px; background-color: ${C.bar}; border-radius: 12px 12px 0 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="middle" style="font-size: 20px; line-height: 1.2; font-weight: 800; letter-spacing: -0.02em; color: ${C.wordmark};">${escapeHtml(SITE_NAME)}</td>
${kickerCell}
</tr>${barLineRow}</table>
</td></tr>
<tr><td class="em-sheet em-pad" style="padding: 28px 28px 8px 28px; background-color: ${C.sheet}; border: 1px solid ${C.line}; border-top: 0; border-radius: 0 0 12px 12px;">
${bodyHtml}
</td></tr>
<tr><td align="center" style="padding: 20px 16px 8px 16px; text-align: center;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};
