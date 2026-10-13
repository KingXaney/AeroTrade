import {describe, expect, it} from 'vitest';
import {md} from '@/lib/learn/copy/lab/md';
import {fencesOf, mathOf, proseOf} from '@/lib/lab/prose';

describe('the md tag', () => {
    it('keeps every backslash and restores an escaped backtick', () => {
        expect(md`$\frac{a}{b}$ and \\ and \`code\``).toBe('$\\frac{a}{b}$ and \\\\ and `code`');
        // String.raw: a newline is written as a newline, never as an escape.
        expect(md`\`\`\`python
x = 1
\`\`\``).toBe('```python\nx = 1\n```');
    });
});

describe('proseOf, fencesOf and mathOf', () => {
    const body = 'Words here $x^2$ then\n\n```python\nbuy NVDA\n```\n\nand $$\\int f$$ and `sell SPY` and a \\$5 note, $a \\$ b$ end.';

    it('strips code and maths before the no-advice check', () => {
        const prose = proseOf(body);
        expect(prose).not.toMatch(/NVDA|SPY|\\int|x\^2/);
        expect(prose).toMatch(/Words here/);
        expect(prose).toMatch(/a \\\$5 note/);
    });

    it('lists the fenced blocks with their info strings', () => {
        expect(fencesOf(body)).toEqual([{info: 'python', body: 'buy NVDA\n'}]);
    });

    it('lists maths spans, display then inline, and does not pair an escaped dollar', () => {
        expect(mathOf(body)).toEqual(['\\int f', 'x^2', 'a \\$ b']);
    });
});
