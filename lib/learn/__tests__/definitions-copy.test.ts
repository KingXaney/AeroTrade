// The label every panel's one "What these mean" disclosure carries (components/learn/WhatTheseMean),
// held to the no-advice list like every other learner-facing sentence (invariant 12).

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {DEFINITIONS_COPY} from '@/lib/learn/copy/definitions';

describe('DEFINITIONS_COPY', () => {
    it('describes and never advises', () => {
        for (const text of Object.values(DEFINITIONS_COPY)) expect(findBanned(text, 'copy'), text).toEqual([]);
    });

    it('is the one label every definitions disclosure uses', () => {
        expect(DEFINITIONS_COPY.label).toBe('What these mean');
    });
});
