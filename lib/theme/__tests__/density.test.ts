import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The look's density is a handful of tokens on :root — the bar's height, the rail's width, where
// the content starts, how wide its column runs — and the frame and the content read them. While
// the look was one of five styles its sizes were written a second time over the base ones,
// outside any cascade layer, so each beat whatever a page or a component said about its own
// spacing; a size said twice drifts, and a rule that beats the call site hides the change it
// overrides. This reads the stylesheet and the components and holds the tokens to one place.

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (relative: string): string => readFileSync(`${root}${relative}`, 'utf8');

// ── A small reader of the stylesheet: every style rule with the at-rules around it. ──
type Rule = {selector: string; body: string; context: string[]};

const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

const closing = (text: string, open: number): number => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            i = text.indexOf(ch, i + 1);
            if (i < 0) break;
        } else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return i;
    }
    throw new Error('unbalanced braces');
};

// A grouping at-rule (@layer, @media) is read through and named in each rule's context; one that
// holds no rules (@keyframes) is passed over.
const readRules = (text: string): Rule[] => {
    const rules: Rule[] = [];
    const walk = (from: number, to: number, context: string[]) => {
        let start = from;
        for (let i = from; i < to; i++) {
            const ch = text[i];
            if (ch === '"' || ch === "'") {
                i = text.indexOf(ch, i + 1);
                if (i < 0) return;
            } else if (ch === ';' || ch === '}') start = i + 1;
            else if (ch === '{') {
                const end = closing(text, i);
                const prelude = text.slice(start, i).trim().replace(/\s+/g, ' ');
                if (!prelude.startsWith('@')) rules.push({selector: prelude, body: text.slice(i + 1, end), context});
                else if (!/^@(keyframes|font-face|property)\b/.test(prelude)) walk(i + 1, end, [...context, prelude]);
                i = end;
                start = end + 1;
            }
        }
    };
    walk(0, text.length, []);
    return rules;
};

// What a rule declares for one property, each time it says it.
const valuesOf = (rule: Rule, property: string): string[] =>
    rule.body.split(';').flatMap((declaration) => {
        const colon = declaration.indexOf(':');
        return colon > 0 && declaration.slice(0, colon).trim() === property ? [declaration.slice(colon + 1).trim()] : [];
    });

// A selector list's own selectors: split at its commas, never at one inside :is(…) or :not(…).
const selectorsOf = (selector: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(selector.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(selector.slice(start).trim());
    return parts;
};

// A component's code without its comments, so a word in a sentence about a class is not the class.
const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

const css = withoutComments(read('app/globals.css'));
const rules = readRules(css);

// The source files of the pages and components, and their text.
const sources = ['app', 'components'].flatMap((dir) =>
    readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
        .filter((file) => /\.tsx?$/.test(file))
        // Windows lists nested entries with backslashes; the paths below use forward slashes.
        .map((file) => `${dir}/${file.replace(/\\/g, '/')}`));
const sourceText = sources.map((file) => ({file, text: read(file)}));

// The tokens the look's density is made of: the frame and the content, then what is drawn inside
// a page — a row's padding, a page title's size, a tab's height, a tall field's, the radii.
const DENSITY = [
    '--header-h', '--chrome-px', '--chrome-py', '--search-h', '--rail-w', '--rail-tile',
    '--content-pt', '--sticky-top', '--content-px', '--content-px-lg', '--content-pb', '--content-max',
    '--row-pad-y', '--row-pad-x', '--title-size', '--tab-pad-y', '--field-h',
    '--panel-radius', '--control-radius', '--card-radius',
] as const;

describe("the look's density tokens (app/globals.css)", () => {
    it.each(DENSITY)('%s is declared once, on :root, under no layer or media query', (token) => {
        const found = rules.flatMap((rule) => valuesOf(rule, token).map(() => rule));
        expect(found.map((rule) => rule.selector)).toEqual([':root']);
        expect(found[0].context).toEqual([]);
    });

    // A token no rule and no class reads is a size nothing has; one read under a misspelt name
    // is a size that silently resolves to nothing, which this cannot catch, but a token left
    // unread after a rename shows here.
    it.each(DENSITY)('%s is read by the stylesheet or by a class at a call site', (token) => {
        const inSheet = css.split(`var(${token})`).length - 1;
        // A utility that reads a variable: pt-(--content-pt), or with its type, text-(length:--title-size).
        const atCallSites = sourceText.filter(({text}) => text.includes(`(${token})`) || text.includes(`:${token})`)).length;
        expect(inSheet + atCallSites).toBeGreaterThan(0);
    });

    // The content starts a fixed step under the bar, and anything that sticks or is scrolled to
    // stops where the content starts: change the bar's height and both follow.
    it("derives where the content starts, and where a sticky panel stops, from the bar's height", () => {
        const value = (token: string): string => rules.flatMap((rule) => (rule.selector === ':root' ? valuesOf(rule, token) : []))[0] ?? '';
        const reaches = (token: string, target: string, seen = new Set<string>()): boolean => {
            if (seen.has(token)) return false;
            seen.add(token);
            return [...value(token).matchAll(/var\((--[\w-]+)/g)].some(([, next]) => next === target || reaches(next, target, seen));
        };
        expect(value('--content-pt')).toMatch(/^calc\(var\(--header-h\) \+ [\d.]+rem\)$/);
        expect(reaches('--content-pt', '--header-h')).toBe(true);
        expect(reaches('--sticky-top', '--header-h')).toBe(true);
    });

    // Every anchor the page scrolls to — a fragment in the address, Next's own scroll on a
    // navigation, a field that takes the focus — lands under the bar, not behind it: the root
    // scroller's padding, once, for every target (Next's Link docs: "Scroll offset with sticky
    // headers"), instead of a margin on each.
    it('lands every anchor where the content starts', () => {
        const scrolled = rules.filter((rule) => valuesOf(rule, 'scroll-padding-top').length > 0);
        expect(scrolled.map((rule) => rule.selector)).toEqual(['html']);
        expect(valuesOf(scrolled[0], 'scroll-padding-top')).toEqual(['var(--sticky-top)']);
        expect(scrolled[0].context).toEqual(['@layer base']);
    });

    // The reader's own browser size is the root size: every rem in the app, and every size the
    // poker table and the office measure their drawing by, is that one. A root rule is found inside a
    // selector list too (html, body), and a size is found however it is said: by name, in the font
    // shorthand (font: 400 17px/1.5 …), or as a text size applied with @apply.
    it('sets no root font size', () => {
        const isRoot = (part: string): boolean => /^(html|:root)(\[[^\]]*\]|:[\w-]+(\([^)]*\))?)*$/.test(part);
        expect(['html', ':root', 'html[data-palette="nord"]', ':root:not([data-theme="light"])'].every(isRoot)).toBe(true);
        expect(['html body', 'html > body', 'body', '.html'].some(isRoot)).toBe(false);
        const rootRules = rules.filter((rule) => selectorsOf(rule.selector).some(isRoot));
        expect(rootRules.length).toBeGreaterThan(0);
        for (const rule of rootRules) {
            expect(valuesOf(rule, 'font-size'), rule.selector).toEqual([]);
            expect(valuesOf(rule, 'font'), rule.selector).toEqual([]);
            expect(rule.body, rule.selector).not.toMatch(/@apply[^;]*(?<![\w-])(?:[\w-]+:)*text-(xs|sm|base|lg|\d*xl|\[[\d.]|\(length)/);
        }
    });

    // A page's title is the shared one's size: PageTitle's h1, and the h1s a page writes by hand (an
    // account's heading, a stock's name, a friend's, a strategy's) with the class PageTitle exports.
    // The pages drawn in a frame of their own keep theirs: the auth pages, the front door, the 404,
    // the office and poker night's table.
    it('sizes every page title in the app by pageTitleClass, the hand-written ones too', () => {
        const ownFrame = /^(app\/\((auth|reset|marketing)\)\/|app\/not-found\.tsx$|components\/(auth|poker-night|agent-world\/office)\/)/;
        const h1s = sourceText.filter(({file}) => !ownFrame.test(file))
            .flatMap(({file, text}) => [...codeOf(text).matchAll(/<h1\b[^>]*>/g)].map(([tag]) => ({file, tag})));
        expect(h1s.map(({file}) => file)).toEqual(expect.arrayContaining([
            'components/primitives/PageTitle.tsx', 'components/trading/accounts/AccountHeading.tsx', 'components/stocks/StockHeader.tsx',
            'app/(root)/friends/[id]/page.tsx', 'app/(root)/strategies/[slug]/page.tsx',
        ]));
        expect(h1s.filter(({tag}) => !/\bpageTitleClass\b/.test(tag)).map(({file, tag}) => `${file}: ${tag}`)).toEqual([]);
    });

    // A panel that sticks stops where the content starts, under the bar: every class list in app/ and
    // components/ that makes a box sticky gives it top-(--sticky-top) under the same variant, never an
    // offset of its own (a top of 1rem once left the topics' rail 40px under the bar).
    it('stops every sticky panel at --sticky-top', () => {
        const sticky = /(?<![\w-])((?:[a-z0-9-]+:)*)sticky(?![\w-])/g;
        const found = sourceText.flatMap(({file, text}) => codeOf(text).split('\n')
            .flatMap((line) => [...line.matchAll(sticky)].map(([, variant]) => ({file, variant, line: line.trim()}))));
        expect(found.map(({file}) => file)).toEqual(expect.arrayContaining(['components/topics/TopicsShell.tsx', 'app/(root)/settings/page.tsx']));
        for (const {file, variant, line} of found) expect(line, file).toContain(`${variant}top-(--sticky-top)`);
    });

    // The drawer's head is as tall as the bar it opens under, and the front door's content starts
    // where the app's does.
    it('sizes the drawer\'s head and the front door\'s top by the tokens', () => {
        expect(read('components/shell/MobileNav.tsx')).toMatch(/(^|[\s"'`])h-\(--header-h\)([\s"'`]|$)/m);
        expect(read('app/(marketing)/welcome/page.tsx')).toMatch(/(^|[\s"'`])pt-\(--content-pt\)([\s"'`]|$)/m);
    });

    // .glass-panel and the floating chrome sit outside every cascade layer, where they beat a utility
    // written beside them (invariant 7): in a layer, a rounded-* or a bg-* at the call site would win
    // over the look's own radius and fill.
    it('keeps .glass-panel and the floating chrome outside every cascade layer', () => {
        for (const selector of ['.glass-panel', '.chrome-surface', '[data-slot="dialog-content"]', '[data-slot="popover-content"]']) {
            const own = rules.filter((rule) => selectorsOf(rule.selector).includes(selector));
            expect(own.length, selector).toBeGreaterThan(0);
            for (const rule of own) expect(rule.context.filter((at) => at.startsWith('@layer')), `${selector} in ${rule.selector}`).toEqual([]);
        }
    });

    // A heading's lines are balanced, and a paragraph kept from ending on one word, by the style alone
    // (text-wrap-style): the text-wrap shorthand also sets the wrap mode back to wrap, so a heading in
    // a parent that says nowrap (the search dialog's hidden title) broke one word a line.
    it('balances headings and paragraphs with text-wrap-style, never the text-wrap shorthand', () => {
        const heading = rules.filter((rule) => selectorsOf(rule.selector).join(',') === 'h1,h2,h3,h4,h5,h6');
        const paragraph = rules.filter((rule) => rule.selector === 'p' && valuesOf(rule, 'text-wrap-style').length > 0);
        expect(heading.flatMap((rule) => valuesOf(rule, 'text-wrap-style'))).toEqual(['balance']);
        expect(paragraph.flatMap((rule) => valuesOf(rule, 'text-wrap-style'))).toEqual(['pretty']);
        expect(rules.filter((rule) => valuesOf(rule, 'text-wrap').length > 0).map((rule) => rule.selector)).toEqual([]);
    });

    // In the utilities layer the frame's rules came after Tailwind's own utilities and beat a class
    // written at a call site; in the components layer the call site wins.
    it('keeps the frame in the components layer, and the frame reads the tokens', () => {
        for (const selector of ['.header', '.header-wrapper', '.header-bar', '.rail']) {
            const own = rules.filter((rule) => rule.selector.split(',').some((part) => part.trim().split(/[\s>+~:]/)[0] === selector));
            expect(own.length, selector).toBeGreaterThan(0);
            for (const rule of own) expect(rule.context[0], `${rule.selector}`).toBe('@layer components');
        }
        const one = (selector: string): Rule => rules.find((rule) => rule.selector === selector && rule.context.length === 1) as Rule;
        expect(valuesOf(one('.header'), 'height')).toEqual(['var(--header-h)']);
        expect(valuesOf(one('.rail'), 'width')).toEqual(['var(--rail-w)']);
        expect(valuesOf(one('.rail'), 'top')).toEqual(['var(--header-h)']);
        expect(valuesOf(one('.header-wrapper'), 'padding')).toEqual(['var(--chrome-py) var(--chrome-px)']);
    });

    // A row's padding is the token's, in the components layer, so a row that asks for its own at
    // the call site gets it: RowCard's own classes leave the padding to the rule.
    it('pads a row with the row tokens, which a call site may override', () => {
        const rows = rules.filter((rule) => rule.selector === '.row-card');
        expect(rows.length).toBeGreaterThan(0);
        for (const rule of rows) expect(rule.context).toEqual(['@layer components']);
        expect(rows.flatMap((rule) => valuesOf(rule, 'padding'))).toEqual(['var(--row-pad-y) var(--row-pad-x)']);
        expect(read('components/primitives/RowCard.tsx')).toMatch(/const BASE = 'row-card';/);
    });

    // One track for a section's pages and for a page's views, a class in the components layer that
    // both carry (never a rule on the tablist role), each tab as tall as --tab-pad-y makes it. On
    // a phone it is one row that scrolls sideways with no bar drawn, its tabs never shrinking or
    // wrapping, the current one kept in sight; under a coarse pointer each tab is a 44px target.
    it('draws both kinds of tabs in one track, their height from --tab-pad-y', () => {
        const track = rules.filter((rule) => rule.selector === '.tab-track');
        for (const rule of track) expect(rule.context[0]).toBe('@layer components');
        expect(track.filter((rule) => rule.context.length === 1).length).toBe(1);
        expect(rules.filter((rule) => /\[role=["']?tab/.test(rule.selector)).map((rule) => rule.selector)).toEqual([]);
        for (const file of ['components/shell/SectionTabs.tsx', 'components/primitives/Tabs.tsx']) {
            const text = read(file);
            expect(text, file).toMatch(/\btab-track\b/);
            expect(text, file).toContain('py-(--tab-pad-y)');
            expect(text, file).toMatch(/\bshrink-0\b/);
            expect(text, file).toMatch(/\bwhitespace-nowrap\b/);
            expect(text, file).toMatch(/(^|[\s'"])(pointer-coarse:)?min-h-11\b/);
            expect(text, file).toMatch(/\buseCurrentInTrack(<\w+>)?\(/);
        }
    });

    it('makes the tab track one sideways-scrolling row on a phone', () => {
        const phone = '@media (width < 48rem)';
        const scrolling = rules.filter((rule) => rule.selector === '.tab-track' && rule.context.join(' ') === `@layer components ${phone}`);
        expect(scrolling.length).toBe(1);
        expect(valuesOf(scrolling[0], 'flex-wrap')).toEqual(['nowrap']);
        expect(valuesOf(scrolling[0], 'overflow-x')).toEqual(['auto']);
        expect(valuesOf(scrolling[0], 'scrollbar-width')).toEqual(['none']);
        const bar = rules.filter((rule) => rule.selector === '.tab-track::-webkit-scrollbar');
        expect(bar.map((rule) => rule.context.join(' '))).toEqual([`@layer components ${phone}`]);
        expect(valuesOf(bar[0], 'display')).toEqual(['none']);
        // A section's tabs never wrap from md: the row only scrolls where it would.
        expect(rules.filter((rule) => rule.selector === '.tab-track' && rule.context.length === 1)
            .flatMap((rule) => valuesOf(rule, 'overflow-x'))).toEqual([]);
    });

    // A row that is a link (or a button) is pressed by a thumb on a phone, whatever padding its
    // call site asked for: a 44px target under a coarse pointer, in the components layer, so a
    // call site may still say otherwise.
    it('keeps a row that is a link a 44px target under a coarse pointer', () => {
        const pressed = rules.filter((rule) => /\.row-card\b/.test(rule.selector) && valuesOf(rule, 'min-height').length > 0);
        expect(pressed.map((rule) => [rule.selector, rule.context.join(' ')])).toEqual([[':is(a, button).row-card', '@layer components @media (pointer: coarse)']]);
        expect(valuesOf(pressed[0], 'min-height')).toEqual(['2.75rem']);
    });

    // The bar's search is a pill from md and a circle --search-h across below it, never an oval.
    it('draws the search as a circle on a phone', () => {
        const trigger = read('components/shell/SearchCommand.tsx').match(/className="(search-text [^"]*)"/)?.[1] ?? '';
        const classes = trigger.split(/\s+/);
        expect(classes).toEqual(expect.arrayContaining(['size-(--search-h)', 'rounded-full', 'md:w-full']));
        // No height or width below md other than the circle's.
        expect(classes.filter((name) => /^(h|w|min-w|min-h|px)-/.test(name))).toEqual([]);
    });

    // Every page title is the shared one's size: PageTitle draws its h1 with the class it exports.
    it("sizes the shared page title by --title-size", () => {
        const title = read('components/primitives/PageTitle.tsx');
        expect(title).toMatch(/export const pageTitleClass = '[^']*text-\(length:--title-size\)[^']*';/);
        expect(title).toMatch(/<h1 className=\{cn\(pageTitleClass\b/);
    });

    // The auth pages' tall fields and their main button, one height.
    it('makes the tall fields and the main button --field-h tall', () => {
        for (const selector of ['.form-input', '.yellow-btn', '.select-trigger', '.country-select-trigger']) {
            const own = rules.filter((rule) => rule.selector === selector);
            expect(own.length, selector).toBe(1);
            expect(valuesOf(own[0], 'height').map((value) => value.replace(/\s*!important$/, '')), selector).toEqual(['var(--field-h)']);
            expect(own[0].body, selector).not.toMatch(/@apply[^;]*\bh-\d/);
        }
    });

    // The stylesheet says nothing about a page's own spacing or a component's own size: the gap a
    // grid asks for, the width a game page keeps, a title's size, the search's, the rail's tiles',
    // the tabs' and the launcher's are each said once, where they are drawn.
    it('reaches into no page and sizes no component that says its own size', () => {
        const reaching = rules.filter((rule) => /\[data-app-content\]|:has\(> \.glass-panel\)|\[data-lab-grid\]|\[data-section-tabs|\[data-settings-tab|\.rail nav\b/.test(rule.selector));
        expect(reaching.map((rule) => rule.selector)).toEqual([]);
        for (const selector of ['.search-text', '.robot-launcher']) {
            for (const rule of rules.filter((r) => r.selector === selector)) {
                for (const property of ['width', 'height', 'border-radius']) expect(valuesOf(rule, property), `${selector} ${property}`).toEqual([]);
            }
        }
    });
});

// The bar was 64px, and then a style's 76px, while the pages kept an offset of their own written
// for it: the content's top, a sticky panel's top and an anchor's scroll margin. Those now read the
// tokens. Built from parts, so that Tailwind, which scans this file too, makes no class of them.
const offsetClass = (utility: string, step: number): RegExp => new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*${utility}-${step}(?![\\w-])`);
const offenders = (utility: string, step: number, allowed: readonly string[] = []): string[] =>
    sourceText.filter(({file, text}) => !allowed.includes(file) && offsetClass(utility, step).test(text)).map(({file}) => file);

describe("the header's offsets in app/ and components/", () => {
    it('finds a class where one is written', () => {
        expect(offsetClass('pt', 20).test('className="lg:pt-20 px-6"')).toBe(true);
        expect(offsetClass('pt', 20).test('className="pt-200"')).toBe(false);
        expect(sources.length).toBeGreaterThan(100);
    });

    it("leaves the content's top to the tokens", () => {
        expect(offenders('pt', 20)).toEqual([]);
    });

    // Poker night's table has a top bar of its own: its Hands drawer scrolls inside itself and keeps
    // its own margin, which it hands the guide.
    it('leaves anchors and sticky panels to the tokens, but in poker night\'s drawer', () => {
        const drawer = ['components/poker-night/HandsDrawer.tsx'];
        expect(offenders('top', 24, drawer)).toEqual([]);
        expect(offenders('scroll-mt', 24, drawer)).toEqual([]);
    });
});
