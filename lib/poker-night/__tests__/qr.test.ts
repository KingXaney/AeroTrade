// The invite's QR code as rectangles: every dark module covered exactly once, by runs that stay in
// their row and never touch a light one, for a real table link encoded by uqr and for edge rows.

import {describe, expect, it} from 'vitest';
import {encode} from 'uqr';
import {qrRuns} from '@/lib/poker-night/qr';

const cover = (runs: ReturnType<typeof qrRuns>, size: number): number[][] => {
    const seen = Array.from({length: size}, () => new Array<number>(size).fill(0));
    for (const r of runs) for (let x = r.x; x < r.x + r.w; x++) seen[r.y][x]++;
    return seen;
};

describe('the QR code\'s runs', () => {
    it('cover exactly the dark modules of a table link', () => {
        const qr = encode('https://aerotrading.vercel.app/play/K7QXM4', {ecc: 'M', border: 2});
        const runs = qrRuns(qr.data);
        const seen = cover(runs, qr.size);
        qr.data.forEach((row, y) => row.forEach((dark, x) => expect(seen[y][x], `${x},${y}`).toBe(dark ? 1 : 0)));
        // Merged: fewer shapes than dark modules.
        const dark = qr.data.flat().filter(Boolean).length;
        expect(runs.length).toBeLessThan(dark);
        expect(runs.every((r) => r.w > 0)).toBe(true);
    });

    it('handle rows that start, end or are all dark, and an empty matrix', () => {
        expect(qrRuns([[true, true, false, true], [false, false, false, false], [true, true, true, true]])).toEqual([
            {x: 0, y: 0, w: 2}, {x: 3, y: 0, w: 1}, {x: 0, y: 2, w: 4},
        ]);
        expect(qrRuns([])).toEqual([]);
    });
});
