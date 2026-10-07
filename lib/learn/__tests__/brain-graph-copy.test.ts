// The knowledge graph's sentences (lib/learn/copy/brain.ts), both the 3D graph's and the SVG
// fallback's, held to the 'copy' tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {BRAIN_COPY} from '@/lib/learn/copy/brain';

describe('the knowledge graph\'s copy', () => {
    const lines = [BRAIN_COPY.graphEmpty, BRAIN_COPY.graphLegend, BRAIN_COPY.graphHint, BRAIN_COPY.graphShells, BRAIN_COPY.graphHint3d, BRAIN_COPY.graphAria];

    it('describes, never advises', () => {
        for (const text of lines) {
            expect(text.trim().length).toBeGreaterThan(0);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('says what the three shells and the halo mean', () => {
        expect(BRAIN_COPY.graphShells).toMatch(/themes inner/);
        expect(BRAIN_COPY.graphShells).toMatch(/tickers outer/);
        expect(BRAIN_COPY.graphShells).toMatch(/halo = active thesis/);
        expect(BRAIN_COPY.graphAria).toMatch(/^News brain knowledge graph/);
    });
});
