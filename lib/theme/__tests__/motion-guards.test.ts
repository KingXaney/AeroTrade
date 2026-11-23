import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The robot (components/chat/RobotMascot, RobotTipBubble) moves by CSS keyframes alone — no SMIL,
// no Web Animations, no requestAnimationFrame — so the two motion guards at the foot of
// app/globals.css are what keep it still: the OS media query and the in-app toggle's
// html[data-motion="reduced"]. A class missing from either list would move under "Reduce motion";
// this pins each one there. Both guards also zero the motion tokens, which turns everything timed
// on them into a cut and stops nothing timed in literal seconds — so every animation timed that
// way is found by reading the stylesheet, and held to both lists by name (the spinners alone are
// left turning, a decision written down at SPINNERS below). Poker night's
// table (components/poker-night) animates the same way — CSS keyframes on lib/poker-night/
// choreography's timeline — and every one of its classes is pinned beside the robot's. (A winner's
// stack counting up is formatted text a timer steps on the same --motion-base, CountUp, not a
// keyframe; a fold turns its card's inner layer, .pn-fold-turn, beside the card's own .pn-fold.)

// ── A small reader of the stylesheet, for the rules the guards are held to. ──
// A style rule: its selector, what it declares, and where it starts in the file.
type Rule = {selector: string; body: string; at: number};

// Comments blanked in place, so a position in the result is the same position in the file.
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

// The index of the brace that closes the block opening at `open`; a quoted string is passed over.
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

// Every style rule, wherever it sits: an at-rule that groups rules (@layer, @media, @container) is
// read through, one that holds none (@keyframes) is passed over.
const readRules = (text: string): Rule[] => {
    const rules: Rule[] = [];
    const walk = (from: number, to: number) => {
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
                if (!prelude.startsWith('@')) rules.push({selector: prelude, body: text.slice(i + 1, end), at: start});
                else if (!/^@(keyframes|font-face|property)\b/.test(prelude)) walk(i + 1, end);
                i = end;
                start = end + 1;
            }
        }
    };
    walk(0, text.length);
    return rules;
};

// A value's parts at its top level: what sits in parentheses, brackets or quotes stays whole.
const splitTop = (value: string, separator: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '"' || ch === "'") {
            const close = value.indexOf(ch, i + 1);
            i = close < 0 ? value.length : close;
        } else if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (depth === 0 && ch === separator) {
            parts.push(value.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(value.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
};

// What a rule declares for one property (twice, if it says it twice).
const valuesOf = (rule: Rule, property: string): string[] =>
    splitTop(rule.body, ';').flatMap((declaration) => {
        const colon = declaration.indexOf(':');
        return declaration.slice(0, colon).trim() === property ? [declaration.slice(colon + 1).trim()] : [];
    });

// How long one animation of the shorthand runs: the first time it names, the second being its
// delay. A time is a literal (1.6s, 750ms) or a function that works one out (calc(…), var(…)); the
// easing token is neither.
const LITERAL_TIME = /^(\d+\.?\d*|\.\d+)(ms|s)$/;
const durationOf = (animation: string): string | undefined =>
    splitTop(animation.replace(/\s+/g, ' '), ' ')
        .find((token) => LITERAL_TIME.test(token) || (/^(calc|var|min|max|clamp)\(/.test(token) && token !== 'var(--motion-ease)'));

// A duration the guards' zeroed tokens cut to nothing: the token itself, or the token times
// factors with no unit of their own — calc(var(--motion-base) * 1.4), calc(var(--motion-base) *
// var(--pn-dur, 2)), whose factor CSS can only read as a number. Anything else that names the token
// can carry a time past it — calc(var(--motion-base) + 1s), max(var(--motion-base), 600ms) — and
// still moves under both guards, so it counts as literal time.
const MOTION_TOKEN = /^var\(--motion-(fast|base)\)$/;
const UNITLESS = /^(-?(\d+\.?\d*|\.\d+)|var\(--[\w-]+(, ?-?(\d+\.?\d*|\.\d+))?\))$/;
const onMotionToken = (time: string): boolean => {
    const value = time.replace(/\s+/g, ' ').trim();
    if (MOTION_TOKEN.test(value)) return true;
    const product = value.match(/^calc\((.*)\)$/)?.[1];
    if (product === undefined) return false;
    const factors = splitTop(product, '*');
    return factors.some((factor) => MOTION_TOKEN.test(factor)) && factors.every((factor) => MOTION_TOKEN.test(factor) || UNITLESS.test(factor));
};

// The animations a rule takes through @apply: Tailwind's animate-* utilities (spin, ping, pulse,
// bounce, tw-animate-css's enter and exit) each run for a time of their own, which no motion token
// carries. Each is named for the utility it stands for, '@apply animate-spin', with any variant
// (motion-safe:, hover:) or important mark left off.
const appliedAnimations = (rule: Rule): string[] =>
    splitTop(rule.body, ';')
        .filter((statement) => /^@apply\s/.test(statement))
        .flatMap((statement) => statement.split(/\s+/).slice(1))
        .map((utility) => (utility.split(':').pop() ?? '').replace(/^!|!$/g, ''))
        .filter((utility) => utility.startsWith('animate-') && utility !== 'animate-none')
        .map((utility) => `@apply ${utility}`);

// The times a rule's animations run for that the guards' zeroed tokens do not cut, those taken
// through @apply among them. (A utility written at a call site is not in this file to be read:
// STOPPED below names those by hand, and SPINNERS the ones left turning.)
const literalTimes = (rule: Rule): string[] => [
    ...[
        ...valuesOf(rule, 'animation').flatMap((value) => splitTop(value, ',').map(durationOf)),
        ...valuesOf(rule, 'animation-duration').flatMap((value) => splitTop(value, ',')),
    ].filter((time): time is string => time !== undefined && !onMotionToken(time)),
    ...appliedAnimations(rule),
];

// The names a guard can stop a selector's element by: the classes of the compound it ends on
// (.pn-ambient-twinkle:nth-child(3n) is stopped as .pn-ambient-twinkle), each with the
// pseudo-element when the selector styles one — a guard on the class alone does not reach a
// ::before. A class inside :not(…) or :is(…) is no name of the element, so none is read there,
// and a selector that ends on no class of its own has no name at all.
const stopNames = (selector: string): string[] => {
    let depth = 0;
    const flat = [...selector].map((ch) => {
        if (ch === '(' || ch === '[') depth++;
        const inside = depth > 0;
        if (ch === ')' || ch === ']') depth--;
        return inside ? '#' : ch;
    }).join('');
    const subject = flat.split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
    const pseudoElement = subject.match(/::[a-z-]+|:(?:before|after)\b/)?.[0] ?? '';
    return [...subject.matchAll(/\.-?[_a-zA-Z][\w-]*/g)].map(([name]) => `${name}${pseudoElement}`);
};

describe('the motion guards in app/globals.css', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');

    // The text of the block that opens at `start`, up to and including its closing brace.
    const block = (start: number): string => {
        let depth = 0;
        for (let i = css.indexOf('{', start); i < css.length; i++) {
            if (css[i] === '{') depth++;
            if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
        }
        throw new Error('unbalanced braces');
    };

    const mediaBlock = block(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const toggleStart = css.indexOf('html[data-motion="reduced"] :is(');
    const toggleSelector = css.slice(toggleStart, css.indexOf('{', toggleStart));

    // The same two guards as the reader sees them: the rules inside the OS query's block — the
    // last one of its kind in the file — and the rules under the toggle's attribute. What each
    // stops by name is every selector of a rule that says `animation: none !important`.
    const plain = withoutComments(css);
    const rules = readRules(plain);
    const guardStart = plain.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    const guardEnd = closing(plain, plain.indexOf('{', guardStart));
    const inMediaGuard = (rule: Rule): boolean => rule.at > guardStart && rule.at < guardEnd;
    const underToggle = (rule: Rule): boolean => rule.selector.startsWith('html[data-motion="reduced"]');
    const stopsAnimation = (rule: Rule): boolean => valuesOf(rule, 'animation').includes('none !important');
    const mediaRules = rules.filter(inMediaGuard);
    const mediaStopped = mediaRules.filter(stopsAnimation).flatMap((rule) => splitTop(rule.selector, ','));
    const toggleStopped = rules.filter((rule) => underToggle(rule) && stopsAnimation(rule))
        .flatMap((rule) => splitTop(rule.selector.match(/^html\[data-motion="reduced"\] :is\((.*)\)$/)?.[1] ?? '', ','));

    // Poker night's emotes (P6, EmoteLayer): every class that moves, each named after its keyframe;
    // the phrase's pop-in is a mechanic on the motion token, the rest one-shots in literal time.
    const EMOTES = ['pn-emote-rise', 'pn-phrase-in', 'pn-throw-x', 'pn-throw-y', 'pn-splat', 'pn-petals', 'pn-fizz', 'pn-bounce'];
    const EMOTE_MECHANICS = ['pn-phrase-in'];

    // Poker night's looks (P5, SceneBackdrop and SceneArt): the scenes' ambient loops, in literal
    // seconds on elements that also carry .pn-ambient, and a new scene's fade-in, a mechanic on the
    // motion token.
    const LOOKS = ['pn-ambient-twinkle', 'pn-ambient-drift', 'pn-ambient-flicker', 'pn-ambient-waves', 'pn-scene-fade'];

    // Poker night's end of the night (P7, NightSummary): the award cards stepping in, a mechanic on
    // the motion token (the celebration's confetti is the table's own .pn-confetti).
    const SUMMARY = ['pn-award-in'];

    // Poker night's table (app/globals.css's poker night section): every class that moves.
    const POKER_NIGHT = [
        ...EMOTES.map((name) => `.${name}`),
        ...LOOKS.map((name) => `.${name}`),
        ...SUMMARY.map((name) => `.${name}`),
        '.pn-deal', '.pn-flip', '.pn-chip-slide', '.pn-chip-land', '.pn-sweep', '.pn-fold', '.pn-fold-turn', '.pn-dim', '.pn-win-lift', '.pn-win-glow',
        '.pn-banner-drop', '.pn-chip-stream', '.pn-pot-out', '.pn-seat-in', '.pn-tag-pop', '.pn-win-pop', '.pn-pulse', '.pn-confetti', '.pn-turn-ring', '.pn-ambient',
    ];
    // The trading agent world's floor (components/agent-world/StageStrip): a working role's dot.
    const AGENT_WORLD = ['.aw-working', '.ao-bubble-in', '.ao-lamp', '.ao-confetti', '.ao-stamp-in', '.ao-line-in'];
    // The chat's typing dots: declared in this file, so the reader below finds them too; pinned here
    // by name, as the robot's loops are.
    const CHAT = ['.typing-dot'];
    // Tailwind's pulse (a placeholder that is not the Skeleton, the streak's ring), and the sheets'
    // and dialogs' slides and fades (tw-animate-css's animate-in/out timed by its own duration
    // utilities, components/primitives/Sheet and components/ui/dialog, stopped by their data-slot):
    // utilities at the call sites, so nothing in this file declares them for the reader below.
    // (Those slides' data-open:/data-closed: variants match no attribute Radix writes — it writes
    // data-state — so today nothing slides; the guards hold them still the day it does.)
    const SLIDES = ['[data-slot="sheet-overlay"]', '[data-slot="sheet-content"]', '[data-slot="dialog-overlay"]', '[data-slot="dialog-content"]'];
    const ELSEWHERE = ['.animate-pulse', ...SLIDES];
    // The look's motion vocabulary (the .fx-* classes beside panel-in): the halo round "now", the
    // sweep over a placeholder, the band across a headline panel. The file's @keyframes fx-* are
    // also found by reading it, below, and each is held to this list.
    const VOCABULARY = ['.fx-beacon', '.fx-shimmer', '.fx-sheen'];
    const STOPPED = ['.robot-bob', '.robot-eyes', '.robot-antenna', '.robot-mascot', '.robot-tip-in', ...CHAT, ...ELSEWHERE, ...POKER_NIGHT, ...AGENT_WORLD, ...VOCABULARY];
    // The spinners, which keep turning under both guards, by decision: a spinner stands for work
    // under way (a search, a save), and its turning is what says so; stopped, it is a still arc that
    // reads as done, or as broken. Each is Tailwind's spin: .search-loader takes it through @apply
    // (the reader finds it, and lets it turn because it is listed here), and the call sites write
    // .animate-spin on a Loader2 icon. Only a spinner belongs on this list.
    const SPINNERS = ['.search-loader', '.animate-spin'];

    it('declares the agent world\'s working pulse, a loop in literal seconds', () => {
        expect(css).toContain('@keyframes aw-working {');
        expect(css).toMatch(/\.aw-working \{[^}]*animation: aw-working [\d.]+s [^;]*infinite/);
    });

    it('declares the office\'s loop and one-shots, three of them on the motion token', () => {
        for (const name of ['ao-bubble-in', 'ao-lamp', 'ao-confetti', 'ao-stamp-in', 'ao-line-in']) expect(css).toContain(`@keyframes ${name} {`);
        expect(css).toMatch(/\.ao-lamp \{[^}]*animation: ao-lamp [\d.]+s [^;]*infinite/);
        // A confetti piece rests invisible, so a stopped one is never left on the screen.
        expect(css).toMatch(/\.ao-confetti \{ opacity: 0;/);
        for (const name of ['ao-bubble-in', 'ao-stamp-in', 'ao-line-in']) expect(css).toMatch(new RegExp(`\\.${name} \\{[^}]*animation: ${name} calc\\(var\\(--motion-base\\)`));
    });

    it('finds both guard lists', () => {
        expect(mediaBlock).toContain('animation: none !important');
        expect(toggleStart).toBeGreaterThan(0);
        expect(toggleSelector).toContain('.glass-panel');
        // The reader's two lists are the same two: each holds the panel and far more than it.
        expect(mediaStopped).toContain('.glass-panel');
        expect(toggleStopped).toContain('.glass-panel');
        expect(Math.min(mediaStopped.length, toggleStopped.length)).toBeGreaterThan(40);
    });

    it.each(STOPPED)('%s is stopped by the OS setting and by the in-app toggle', (cls) => {
        expect(mediaBlock).toContain(cls);
        expect(toggleSelector).toContain(cls);
        // By its own name, not as the start of a longer one (.pn-ambient inside .pn-ambient-drift).
        expect(mediaStopped).toContain(cls);
        expect(toggleStopped).toContain(cls);
    });

    // A zeroed token does not reach an animation timed in literal time, so each one in the file
    // must be stopped by name, in both lists. They are found here by reading every rule, so a new
    // loop cannot be forgotten. (While a theme could choose among five styles, the one that zeroed
    // the tokens for itself had to stop these by name too, and a regex per rule pinned that.)
    it('stops by name, in both guards, every animation timed in literal seconds or milliseconds', () => {
        // The reader follows at-rules, not a rule nested inside another: the file has none, and one
        // would be read as part of its parent's declarations. Extend readRules before nesting.
        for (const rule of rules) expect(rule.body, `${rule.selector} nests a rule`).not.toContain('{');

        const timed = rules.filter((rule) => !inMediaGuard(rule) && !underToggle(rule) && literalTimes(rule).length > 0);
        const found = timed.map((rule) => rule.selector);
        // It found the loops this file is known to hold, the spinner taken through @apply among
        // them; a reader that found nothing would pass everything.
        expect(found).toEqual(expect.arrayContaining([
            '.typing-dot', '.robot-bob', '.aw-working', '.ao-confetti', '.pn-pulse', '.pn-petals', '.pn-throw-x', '.pn-ambient-twinkle:nth-child(3n+2)', '.search-loader',
        ]));
        // …and nothing timed on the motion token, which the guards' zeroed tokens already cut.
        for (const onToken of ['.glass-panel', '.pn-deal', '.pn-scene-fade', '.robot-tip-in']) expect(found).not.toContain(onToken);

        for (const rule of timed) {
            for (const selector of splitTop(rule.selector, ',')) {
                const names = stopNames(selector);
                if (names.some((name) => SPINNERS.includes(name))) {
                    // Listed as a spinner, so it is left turning — as long as turning is all it does.
                    expect(literalTimes(rule), `${selector} is on the spinners' list, so its one animation is Tailwind's spin`).toEqual(['@apply animate-spin']);
                    continue;
                }
                const why = `${selector} animates for ${literalTimes(rule).join(', ')}, which the guards' zeroed motion tokens do not cut: name ${names.join(' or ') || 'a class of its own'} in both motion guards`;
                expect(names.some((name) => mediaStopped.includes(name)), why).toBe(true);
                expect(names.some((name) => toggleStopped.includes(name)), why).toBe(true);
            }
        }
    });

    // The reader's own blind spots, each a rule written to fall into one: a duration that names the
    // token but carries a time past it, and an animation taken through @apply.
    it('reads a time beside the motion token, and an animate-* utility taken through @apply, as literal time', () => {
        const [sum, max, scaled, applied] = readRules(withoutComments(`
            .a { animation: a calc(var(--motion-base) + 1s) var(--motion-ease) both; }
            .b { animation-duration: max(var(--motion-base), 600ms); }
            .c { animation: c calc(var(--motion-base) * var(--pn-dur, 2)) var(--motion-ease) calc(var(--motion-base) * var(--pn-at, 0)) both; }
            .d { @apply absolute size-4 motion-safe:animate-spin; color: var(--brand); }
        `));
        expect(literalTimes(sum)).toEqual(['calc(var(--motion-base) + 1s)']);
        expect(literalTimes(max)).toEqual(['max(var(--motion-base), 600ms)']);
        expect(literalTimes(scaled)).toEqual([]);
        expect(literalTimes(applied)).toEqual(['@apply animate-spin']);
    });

    it('zeroes both motion tokens under either guard, so everything timed on them is a cut', () => {
        const zeroed = (rule: Rule | undefined): string[][] => ['--motion-fast', '--motion-base'].map((token) => (rule ? valuesOf(rule, token) : []));
        expect(zeroed(mediaRules.find((rule) => rule.selector === ':root'))).toEqual([['0ms'], ['0ms']]);
        expect(zeroed(rules.find((rule) => rule.selector === 'html[data-motion="reduced"]'))).toEqual([['0ms'], ['0ms']]);
    });

    // The app has one look. Its rules are the stylesheet's own, written under no attribute; a
    // rule (or a comment) that names data-style is a visual style on its way back.
    it('is written for one look: nothing in the stylesheet names data-style', () => {
        expect(css).not.toContain('data-style');
    });

    it('declares the four robot keyframes', () => {
        for (const name of ['robot-bob', 'robot-blink', 'robot-glow', 'robot-tip-in']) {
            expect(css).toContain(`@keyframes ${name}`);
        }
    });

    // The table moves only by CSS: each class that moves names a keyframe this file declares (or
    // a transition), and none of the stylesheet's own animations is left out of the guards.
    it('declares every poker night keyframe, each on a class of its own name', () => {
        const KEYFRAMES = [
            ...EMOTES,
            ...LOOKS,
            ...SUMMARY,
            'pn-deal', 'pn-flip', 'pn-chip-slide', 'pn-chip-land', 'pn-sweep', 'pn-fold', 'pn-fold-turn', 'pn-dim', 'pn-win-lift', 'pn-win-glow',
            'pn-banner-drop', 'pn-chip-stream', 'pn-pot-out', 'pn-seat-in', 'pn-tag-pop', 'pn-win-pop', 'pn-pulse', 'pn-confetti',
        ];
        for (const name of KEYFRAMES) {
            expect(css).toContain(`@keyframes ${name} {`);
            expect(POKER_NIGHT).toContain(`.${name}`);
            expect(css, name).toMatch(new RegExp(`\\.${name}[^{]*\\{[^}]*animation: ${name} `));
        }
        // Every @keyframes the poker night section declares is one of the listed.
        const declared = [...css.matchAll(/@keyframes (pn-[a-z-]+)/g)].map((m) => m[1]);
        expect([...new Set(declared)].sort()).toEqual([...KEYFRAMES].sort());
    });

    it('times the table\'s mechanics on the motion token, so the guards play them at once', () => {
        for (const name of ['pn-deal', 'pn-flip', 'pn-chip-slide', 'pn-chip-land', 'pn-sweep', 'pn-fold', 'pn-fold-turn', 'pn-dim', 'pn-win-lift', 'pn-banner-drop', 'pn-chip-stream', 'pn-pot-out', 'pn-seat-in', 'pn-tag-pop', ...EMOTE_MECHANICS, ...SUMMARY]) {
            const rule = new RegExp(`\\.${name} \\{[^}]*animation: ${name} calc\\(var\\(--motion-base\\)[^;]*calc\\(var\\(--motion-base\\)`);
            expect(css, name).toMatch(rule);
        }
    });

    // The look's motion vocabulary. Every @keyframes fx-* in the file is found here, not listed, so
    // none can be added without the rest: a class of its own name moves by it, written outside any
    // cascade layer beside panel-in (no utility beside it can undo it), stopped by name in both
    // guards whatever it is timed on (a one-shot on the motion token too: stopped, it shows its
    // rest at once rather than relying on a zeroed token), on a real element — no pseudo-element
    // animates, which a guard naming the class would not reach — and used where a page asks for it,
    // since a class lands with its first user and none ships unused. A primitive that draws a class
    // when asked (Panel's `sheen`) is not its user; the page that asks is. A class a pure module
    // decides (the market dot's beacon, lib/stocks/market-dot) is used from there, under its test.
    describe('the motion vocabulary (@keyframes fx-*)', () => {
        const FX = [...new Set([...plain.matchAll(/@keyframes (fx-[\w-]+)/g)].map(([, name]) => name))];
        const layers = [...plain.matchAll(/@layer [\w-]+\s*\{/g)].map((m) => [m.index, closing(plain, m.index + m[0].length - 1)]);
        const layered = (rule: Rule): boolean => layers.some(([open, close]) => rule.at > open && rule.at < close);
        const animated = (rule: Rule): string[] => [...valuesOf(rule, 'animation'), ...valuesOf(rule, 'animation-name')];
        const root = fileURLToPath(new URL('../../..', import.meta.url));
        const read = (file: string): string => readFileSync(`${root}${file}`, 'utf8');
        // The primitives that draw a class of the vocabulary only when a page asks them to, and how a
        // page asks: Panel draws .fx-sheen for its `sheen` prop.
        const ASKED_OF: Record<string, Record<string, RegExp>> = {
            'components/primitives/Panel.tsx': {'fx-sheen': /<\w+\b[^>]*?\ssheen(=\{[^}]*\})?(?=[\s/>])/},
        };
        const files = ['app', 'components', 'lib'].flatMap((dir) =>
            readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
                .map((file) => `${dir}/${file.replace(/\\/g, '/')}`)
                .filter((file) => /\.tsx?$/.test(file) && !file.includes('__tests__') && !(file in ASKED_OF)));
        const sources = files.map(read);

        it('finds the vocabulary in the file, and the guards\' list holds every one', () => {
            expect(FX).toEqual(expect.arrayContaining(['fx-beacon', 'fx-shimmer', 'fx-sheen']));
            expect(VOCABULARY.map((cls) => cls.slice(1)).sort()).toEqual([...FX].sort());
        });

        it.each(FX)('.%s moves by its keyframe, unlayered, on a real element, stopped by both guards', (name) => {
            const own = rules.filter((rule) => !inMediaGuard(rule) && !underToggle(rule) && animated(rule).some((value) => value.split(/[\s,]+/).includes(name)));
            expect(own.map((rule) => rule.selector), name).toEqual([`.${name}`]);
            expect(layered(own[0]), `.${name} sits in a cascade layer`).toBe(false);
            expect(mediaStopped, name).toContain(`.${name}`);
            expect(toggleStopped, name).toContain(`.${name}`);
            // Nothing else in the file animates a pseudo-element with it.
            for (const rule of rules.filter((r) => /::?(before|after)\b/.test(r.selector))) {
                expect(animated(rule).join(' '), rule.selector).not.toContain(name);
            }
            const used = new RegExp(`(^|[\\s'"\`{(])${name}([\\s'"\`})]|$)`, 'm');
            const asked = Object.values(ASKED_OF).flatMap((classes) => (classes[name] ? [classes[name]] : []));
            expect(sources.some((text) => used.test(text) || asked.some((asking) => asking.test(text))),
                `nothing in app/, components/ or lib/ uses .${name} or asks a primitive for it`).toBe(true);
        });

        // The sheen is Panel's to draw and a page's to ask for, once a view: Home's accounts panel and
        // /portfolio's account summary, which hands it to its Panel. Panel.tsx's own span is no user.
        it('crosses the panels a page asks it of: Home\'s accounts and /portfolio\'s summary, once a view', () => {
            const asks = (text: string): string[] => [...text.matchAll(/<(\w+)\b[^>]*?\ssheen(=\{[^}]*\})?(?=[\s/>])/g)].map(([, tag]) => tag);
            expect(asks(read('app/(root)/page.tsx'))).toEqual(['Panel']);
            expect(read('app/(root)/page.tsx')).toMatch(/<Panel id="home-accounts"[^>]*\ssheen(?=[\s/>])/);
            expect(asks(read('app/(root)/portfolio/page.tsx'))).toEqual(['AccountSummary']);
            expect(asks(read('components/trading/portfolio/AccountSummary.tsx'))).toEqual(['Panel']);
            expect(read('components/trading/portfolio/AccountSummary.tsx')).toMatch(/<Panel\b[^>]*\ssheen=\{sheen\}/);
            expect(read('components/primitives/Panel.tsx')).toMatch(/\{sheen && <span className="fx-sheen" aria-hidden="true" \/>\}/);
        });

        // The beacon breathes round the market dot while the session is open, and only then: the dot
        // takes its class from lib/stocks/market-dot, whose test holds both states.
        it('breathes round the market dot by the class the session gives it', () => {
            const dot = read('components/stocks/MarketStatus.tsx');
            expect(dot).toMatch(/marketDotClass\(status\)/);
            expect(dot).not.toMatch(/fx-beacon/);
            expect(read('lib/stocks/market-dot.ts')).toMatch(/fx-beacon/);
        });

        // The band crosses once as its panel arrives, on the motion token, and rests off the panel:
        // its own transform is where it ends, past the far edge, and it starts past the near one.
        it('crosses a panel once with .fx-sheen and leaves it off the surface', () => {
            const sheen = rules.find((rule) => rule.selector === '.fx-sheen') as Rule;
            const [animation] = valuesOf(sheen, 'animation');
            expect(animation).toMatch(/^fx-sheen calc\(var\(--motion-base\) \* [\d.]+\) /);
            expect(animation).not.toMatch(/infinite/);
            const percent = (value: string | undefined): number => Number(value?.match(/^translateX\((-?[\d.]+)%\)$/)?.[1] ?? NaN);
            expect(percent(valuesOf(sheen, 'transform')[0])).toBeGreaterThanOrEqual(100);
            const from = plain.slice(plain.indexOf('@keyframes fx-sheen')).match(/from \{\s*transform: ([^;]+);/)?.[1];
            expect(percent(from)).toBeLessThanOrEqual(-100);
            expect(valuesOf(sheen, 'pointer-events')).toEqual(['none']);
        });
    });
});

// Poker night's scenes (P5): the art's loops run in literal seconds, so both guards stop each by
// name (the discovered rule above holds them to it), and a scene change is timed on the motion
// token, so both guards show the new scene at once.
describe('the poker night scenes in app/globals.css', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

    it('fades a new scene in on the motion token', () => {
        expect(css).toMatch(/\.pn-scene-fade \{[^}]*animation: pn-scene-fade calc\(var\(--motion-base\) \* \d+\)/);
    });

    it('runs the ambient loops forever', () => {
        for (const name of ['twinkle', 'drift', 'flicker', 'waves']) {
            expect(css, name).toMatch(new RegExp(`\\.pn-ambient-${name} \\{[^}]*animation: pn-ambient-${name} [\\d.]+s [^;]*infinite`));
        }
    });
});

// The fold turns the card face down on a layer with no opacity of its own: opacity below 1 flattens
// a preserve-3d element, which would show the face mirrored instead of the back.
describe('the fold in app/globals.css', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
    const rule = (selector: string): string => {
        const at = css.indexOf(`\n${selector} {`);
        expect(at, selector).toBeGreaterThan(0);
        return css.slice(at, css.indexOf('}', at));
    };
    const keyframes = (name: string): string => {
        const at = css.indexOf(`@keyframes ${name} {`);
        let depth = 0;
        for (let i = css.indexOf('{', at); i < css.length; i++) {
            if (css[i] === '{') depth++;
            if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
        }
        return '';
    };

    it('turns on .pn-fold-turn alone, and fades on .pn-fold alone', () => {
        expect(rule('.pn-fold-turn')).toMatch(/rotateY\(180deg\)/);
        expect(rule('.pn-fold-turn')).not.toMatch(/opacity/);
        expect(keyframes('pn-fold-turn')).not.toMatch(/opacity/);
        expect(rule('.pn-fold')).not.toMatch(/rotate/);
        expect(keyframes('pn-fold')).not.toMatch(/rotate/);
    });
});
