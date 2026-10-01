import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Invariant 7: every framed surface is <Panel>. A hand-rolled `glass-panel` className
// drifts from the style axis (and the rounded-*/ring-*/shadow-* written beside it are
// silent no-ops, since .glass-panel sits outside any cascade layer). Sixty-six of them
// were folded into Panel; this keeps the count at zero. Comments may still name the class.
describe('framed surfaces go through Panel', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const PANEL = 'components/primitives/Panel.tsx';
    const sources = ['components', 'app'].flatMap((dir) =>
        readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
            .filter((f) => f.endsWith('.tsx'))
            .map((f) => `${dir}/${f}`));

    const code = (text: string) => text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');

    it("only Panel.tsx spells the glass-panel class", () => {
        const handRolled = sources.filter((file) =>
            file !== PANEL && /\bglass-panel\b/.test(code(readFileSync(`${root}${file}`, 'utf8'))));
        expect(sources).toContain(PANEL);
        expect(sources.length).toBeGreaterThan(50);
        expect(handRolled).toEqual([]);
    });

    it('still sees a hand-rolled panel when one is written', () => {
        expect(/\bglass-panel\b/.test(code('<div className="glass-panel p-5">'))).toBe(true);
        expect(/\bglass-panel\b/.test(code('// .glass-panel sets box-shadow unlayered'))).toBe(false);
        expect(/\bglass-panel\b/.test(code('{/* outline, not ring: .glass-panel */}'))).toBe(false);
    });
});
