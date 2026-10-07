import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The robot (components/chat/RobotMascot, RobotTipBubble) moves by CSS keyframes alone — no SMIL,
// no Web Animations, no requestAnimationFrame — so the two motion guards at the foot of
// app/globals.css are what keep it still: the OS media query and the in-app toggle's
// html[data-motion="reduced"]. A class missing from either list would move under "Reduce motion";
// this pins each one there, and the blobs' class beside them. Brutalist zeroes the motion tokens,
// which stops nothing timed in literal seconds, so its by-name stop is pinned too. Poker night's
// table (components/poker-night) animates the same way — CSS keyframes on lib/poker-night/
// choreography's timeline — and every one of its classes is pinned beside the robot's. (A winner's
// stack counting up is formatted text a timer steps on the same --motion-base, CountUp, not a
// keyframe; a fold turns its card's inner layer, .pn-fold-turn, beside the card's own .pn-fold.)
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

    // Poker night's emotes (P6, EmoteLayer): every class that moves, each named after its keyframe;
    // the phrase's pop-in is a mechanic on the motion token, the rest one-shots in literal time.
    const EMOTES = ['pn-emote-rise', 'pn-phrase-in', 'pn-throw-x', 'pn-throw-y', 'pn-splat', 'pn-petals', 'pn-fizz', 'pn-bounce'];
    const EMOTE_MECHANICS = ['pn-phrase-in'];

    // Poker night's looks (P5, SceneBackdrop and SceneArt): the scenes' ambient loops, in literal
    // seconds on elements that also carry .pn-ambient (which brutalist stops by name), and a new
    // scene's fade-in, a mechanic on the motion token.
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
    const STOPPED = ['.robot-bob', '.robot-eyes', '.robot-antenna', '.robot-mascot', '.robot-tip-in', '.theme-blob', ...POKER_NIGHT];

    it('finds both guard lists', () => {
        expect(mediaBlock).toContain('animation: none !important');
        expect(toggleStart).toBeGreaterThan(0);
        expect(toggleSelector).toContain('.glass-panel');
    });

    it.each(STOPPED)('%s is stopped by the OS setting and by the in-app toggle', (cls) => {
        expect(mediaBlock).toContain(cls);
        expect(toggleSelector).toContain(cls);
    });

    it('declares the four robot keyframes and stops the two timed loops by name in brutalist', () => {
        for (const name of ['robot-bob', 'robot-blink', 'robot-glow', 'robot-tip-in']) {
            expect(css).toContain(`@keyframes ${name}`);
        }
        expect(css).toMatch(/\[data-style="brutalist"\] :is\(\.robot-bob, \.robot-antenna\)\s*\{\s*animation: none;/);
    });

    // The table moves only by CSS: each class that moves names a keyframe this file declares (or
    // a transition), and none of the stylesheet's own animations is left out of the guards.
    it('declares every poker night keyframe and stops the loops and the turn ring by name in brutalist', () => {
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
        expect(css).toMatch(/\[data-style="brutalist"\] :is\(\.pn-pulse, \.pn-win-glow, \.pn-ambient\)\s*\{\s*animation: none;/);
        expect(css).toMatch(/\[data-style="brutalist"\] \.pn-turn-ring\s*\{\s*transition: none;/);
    });

    it('times the table\'s mechanics on the motion token, so brutalist and the guards play them at once', () => {
        for (const name of ['pn-deal', 'pn-flip', 'pn-chip-slide', 'pn-chip-land', 'pn-sweep', 'pn-fold', 'pn-fold-turn', 'pn-dim', 'pn-win-lift', 'pn-banner-drop', 'pn-chip-stream', 'pn-pot-out', 'pn-seat-in', 'pn-tag-pop', ...EMOTE_MECHANICS, ...SUMMARY]) {
            const rule = new RegExp(`\\.${name} \\{[^}]*animation: ${name} calc\\(var\\(--motion-base\\)[^;]*calc\\(var\\(--motion-base\\)`);
            expect(css, name).toMatch(rule);
        }
    });
});

// Poker night's scenes (P5): the art's loops stop with brutalist by the name every looping element
// carries, and a scene change is timed on the motion token, so brutalist and both guards show the
// new scene at once.
describe('the poker night scenes in app/globals.css', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

    it('fades a new scene in on the motion token', () => {
        expect(css).toMatch(/\.pn-scene-fade \{[^}]*animation: pn-scene-fade calc\(var\(--motion-base\) \* \d+\)/);
    });

    it('runs the ambient loops forever, each one stopped in brutalist through .pn-ambient', () => {
        for (const name of ['twinkle', 'drift', 'flicker', 'waves']) {
            expect(css, name).toMatch(new RegExp(`\\.pn-ambient-${name} \\{[^}]*animation: pn-ambient-${name} [\\d.]+s [^;]*infinite`));
        }
        expect(css).toMatch(/\[data-style="brutalist"\] :is\(\.pn-pulse, \.pn-win-glow, \.pn-ambient\)\s*\{\s*animation: none;/);
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
