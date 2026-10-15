// The game widgets Today may carry: a registry whose ids are the stored preference, a default
// for an account that never chose, and a reader of the stored list that drops what it does not
// know and keeps the registry's order.

import {describe, expect, it} from 'vitest';
import {DEFAULT_LAB_WIDGETS, LAB_WIDGET_IDS, LAB_WIDGETS, isLabWidgetId, labWidget, labWidgetsFrom, normalizeLabWidgets} from '@/lib/lab/widgets';
import {LAB_WIDGET_TITLES} from '@/lib/learn/copy/lab';
import {HIGHER_IS_RECORD} from '@/lib/games/rounds';

const GAME_IDS = Object.keys(HIGHER_IS_RECORD);

describe('the widget registry', () => {
    it('names every id once, with a way in, a game for a round-ticked one and a site for an outside one', () => {
        expect(LAB_WIDGETS.map((w) => w.id)).toEqual([...LAB_WIDGET_IDS]);
        for (const widget of LAB_WIDGETS) {
            expect(widget.href, widget.id).toMatch(/^(\/|https:\/\/)/);
            if (widget.doneBy === 'round') expect(GAME_IDS, widget.id).toContain(widget.game);
            if (widget.kind === 'outside') expect(widget.site, widget.id).toBeDefined();
            if (widget.kind === 'outside') expect(widget.doneBy).toBe('manual');
            expect(LAB_WIDGET_TITLES[widget.id].length, widget.id).toBeGreaterThan(2);
        }
        expect(labWidget('codeforces').href).toBe('https://codeforces.com/problemset');
        expect(labWidget('leetcode').site).toBe('leetcode');
    });

    it('reads the stored list: unknown ids dropped, repeats folded, the registry order kept', () => {
        expect(normalizeLabWidgets(['leetcode', 'arithmetic', 'nope', 'arithmetic', 7, null])).toEqual(['arithmetic', 'leetcode']);
        expect(isLabWidgetId('kelly')).toBe(true);
        expect(isLabWidgetId('poker')).toBe(false);
    });

    it('takes an absent preference as the default and an empty one as none', () => {
        expect(labWidgetsFrom(undefined)).toEqual([...DEFAULT_LAB_WIDGETS]);
        expect(labWidgetsFrom(null)).toEqual(['daily-puzzle']);
        expect(labWidgetsFrom([])).toEqual([]);
        expect(labWidgetsFrom(['monkeytype'])).toEqual(['monkeytype']);
    });
});
