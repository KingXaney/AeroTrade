import {describe, expect, it} from "vitest";

import {evidenceHref} from "@/lib/brain/links";

describe('evidenceHref', () => {
    it('opens /brain on the entity and lands on its evidence section', () => {
        expect(evidenceHref('NVDA')).toBe('/brain?entity=NVDA#evidence');
    });

    it('URL-encodes the key, so a theme or sector key survives the query string', () => {
        const href = evidenceHref('ai & chips/semis #1');
        expect(href).toBe('/brain?entity=ai%20%26%20chips%2Fsemis%20%231#evidence');
        expect(href.endsWith('#evidence')).toBe(true);
        expect(new URL(href, 'http://x').searchParams.get('entity')).toBe('ai & chips/semis #1');
    });
});
