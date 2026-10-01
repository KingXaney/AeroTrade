import {describe, expect, it} from 'vitest';
import {cn} from '@/lib/utils';

describe('cn', () => {
    it('merges conditional classes and resolves Tailwind conflicts', () => {
        expect(cn('p-2', {hidden: false, block: true}, 'p-4')).toBe('block p-4');
    });
});
