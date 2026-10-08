// The table's single-key shortcuts: F, C, R and A act; 1–4, Enter and Escape work only with the
// raise panel open, Enter and Escape even from its amount field; nothing fires with ⌘, Ctrl or Alt,
// on a held key, or while the player is typing in a field; Enter on a button stays the button's; and
// the keys listen only on the table itself, and only while the player keeps them on.

import {describe, expect, it} from 'vitest';
import {intentForKey, isControlTarget, isEditableTarget, keyAllowed, KEY_SHORTCUTS} from '@/lib/poker-night/keys';
import {ROOM_KEY_SHORTCUTS, roomIntentForKey, SHORTCUTS, TAP_SHIELD_MS, tapLands} from '@/lib/poker-night/keys';

describe('the shortcuts', () => {
    it('map F, C, R and A in either case', () => {
        expect(intentForKey({key: 'f'})).toBe('fold');
        expect(intentForKey({key: 'F'})).toBe('fold');
        expect(intentForKey({key: 'c'})).toBe('check-call');
        expect(intentForKey({key: 'r'})).toBe('raise');
        expect(intentForKey({key: 'a'})).toBe('all-in');
        expect(intentForKey({key: 'x'})).toBeNull();
        expect(intentForKey({key: 'Tab'})).toBeNull();
    });

    it('pick sizes, confirm and close only with the raise panel open', () => {
        expect(intentForKey({key: '1'})).toBeNull();
        expect(intentForKey({key: 'Enter'})).toBeNull();
        expect(intentForKey({key: 'Escape'})).toBeNull();
        expect(intentForKey({key: '1'}, {raiseOpen: true})).toBe('size-1');
        expect(intentForKey({key: '4'}, {raiseOpen: true})).toBe('size-4');
        expect(intentForKey({key: '5'}, {raiseOpen: true})).toBeNull();
        expect(intentForKey({key: 'Enter'}, {raiseOpen: true})).toBe('confirm');
        expect(intentForKey({key: 'Escape'}, {raiseOpen: true})).toBe('close');
    });

    it('ignore modified and held keys, and keys typed into a field — but Enter and Escape in the amount field', () => {
        expect(intentForKey({key: 'f', metaKey: true})).toBeNull();
        expect(intentForKey({key: 'c', ctrlKey: true})).toBeNull();
        expect(intentForKey({key: 'r', altKey: true})).toBeNull();
        expect(intentForKey({key: 'f', repeat: true})).toBeNull();
        expect(intentForKey({key: 'f', editable: true})).toBeNull();
        expect(intentForKey({key: '2', editable: true}, {raiseOpen: true})).toBeNull();
        expect(intentForKey({key: 'Enter', editable: true}, {raiseOpen: true})).toBe('confirm');
        expect(intentForKey({key: 'Escape', editable: true}, {raiseOpen: true})).toBe('close');
        expect(intentForKey({key: 'Enter', ctrlKey: true}, {raiseOpen: true})).toBeNull();
    });

    it('leave Enter on a focused button, link or menu item to that control, even with the raise panel open', () => {
        // Back, Fold, Call or a quick size focused: Enter is the control's own activation.
        expect(intentForKey({key: 'Enter', control: true}, {raiseOpen: true})).toBeNull();
        // The amount field, the slider, the panel itself or the page: Enter confirms.
        expect(intentForKey({key: 'Enter', editable: true, control: false}, {raiseOpen: true})).toBe('confirm');
        expect(intentForKey({key: 'Enter', control: false}, {raiseOpen: true})).toBe('confirm');
        // Escape still closes the panel from a focused button inside it.
        expect(intentForKey({key: 'Escape', control: true}, {raiseOpen: true})).toBe('close');
    });

    it('listen only on the table, and only while the player keeps them on', () => {
        expect(keyAllowed('f', 'body', true)).toBe(true);
        expect(keyAllowed('f', 'table', true)).toBe(true);
        // The top bar, a drawer, a menu: a stray letter never folds a hand.
        expect(keyAllowed('f', 'elsewhere', true)).toBe(false);
        expect(keyAllowed('Enter', 'elsewhere', true)).toBe(false);
        // Turned off: no letter and no quick size, but Enter and Escape still work the raise panel.
        expect(keyAllowed('f', 'table', false)).toBe(false);
        expect(keyAllowed('2', 'body', false)).toBe(false);
        expect(keyAllowed('Enter', 'table', false)).toBe(true);
        expect(keyAllowed('Escape', 'body', false)).toBe(true);
    });

    it('name every key for aria-keyshortcuts', () => {
        expect(KEY_SHORTCUTS).toMatchObject({fold: 'F', 'check-call': 'C', raise: 'R', 'all-in': 'A'});
    });
});

describe('control targets', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}, role: string | null = null) => ({tagName, ...extra, getAttribute: (name: string) => (name === 'role' ? role : null)});

    it('are buttons, links, summaries, button-like inputs and anything with a control role', () => {
        expect(isControlTarget(el('BUTTON'))).toBe(true);
        expect(isControlTarget(el('a'))).toBe(true);
        expect(isControlTarget(el('SUMMARY'))).toBe(true);
        expect(isControlTarget(el('INPUT', {type: 'submit'}))).toBe(true);
        expect(isControlTarget(el('INPUT', {type: 'checkbox'}))).toBe(true);
        expect(isControlTarget(el('DIV', {}, 'menuitem'))).toBe(true);
        expect(isControlTarget(el('SPAN', {}, 'button'))).toBe(true);
    });

    it('are not the amount field, the slider, the toolbar or the page', () => {
        expect(isControlTarget(el('INPUT', {type: 'text'}))).toBe(false);
        expect(isControlTarget(el('INPUT', {type: 'range'}))).toBe(false);
        expect(isControlTarget(el('DIV', {}, 'toolbar'))).toBe(false);
        expect(isControlTarget(el('DIV', {}, 'group'))).toBe(false);
        expect(isControlTarget(el('BODY'))).toBe(false);
        expect(isControlTarget({tagName: 'BUTTON'})).toBe(true);
        expect(isControlTarget(null)).toBe(false);
    });
});

describe('editable targets', () => {
    it('are text fields, text areas, selects and editable content, not a slider or a button', () => {
        expect(isEditableTarget({tagName: 'INPUT', type: 'text'})).toBe(true);
        expect(isEditableTarget({tagName: 'input', type: 'number'})).toBe(true);
        expect(isEditableTarget({tagName: 'INPUT', type: ''})).toBe(true);
        expect(isEditableTarget({tagName: 'TEXTAREA'})).toBe(true);
        expect(isEditableTarget({tagName: 'SELECT'})).toBe(true);
        expect(isEditableTarget({tagName: 'DIV', isContentEditable: true})).toBe(true);
        expect(isEditableTarget({tagName: 'INPUT', type: 'range'})).toBe(false);
        expect(isEditableTarget({tagName: 'INPUT', type: 'checkbox'})).toBe(false);
        expect(isEditableTarget({tagName: 'INPUT', type: 'text', readOnly: true})).toBe(false);
        expect(isEditableTarget({tagName: 'BUTTON'})).toBe(false);
        expect(isEditableTarget(null)).toBe(false);
        expect(isEditableTarget('input')).toBe(false);
    });
});

// The room's own keys (P6): E, L, B, H, M and ?, under the same rules as the moves, none of them a move.
describe('the room\'s keys', () => {
    it('map E, L, B, H, M and ? in either case', () => {
        expect(roomIntentForKey({key: 'e'})).toBe('emotes');
        expect(roomIntentForKey({key: 'E'})).toBe('emotes');
        expect(roomIntentForKey({key: 'l'})).toBe('log');
        expect(roomIntentForKey({key: 'b'})).toBe('bank');
        expect(roomIntentForKey({key: 'h'})).toBe('hands');
        expect(roomIntentForKey({key: 'H'})).toBe('hands');
        expect(roomIntentForKey({key: 'm'})).toBe('mute');
        expect(roomIntentForKey({key: '?'})).toBe('shortcuts');
        expect(roomIntentForKey({key: 'f'})).toBeNull();
        expect(roomIntentForKey({key: 'Escape'})).toBeNull();
    });

    it('never fire with a modifier, on a held key or while typing', () => {
        for (const extra of [{metaKey: true}, {ctrlKey: true}, {altKey: true}, {repeat: true}, {editable: true}]) {
            expect(roomIntentForKey({key: 'e', ...extra})).toBeNull();
        }
    });

    it('never share a key with a move', () => {
        for (const key of ['e', 'l', 'b', 'h', 'm', '?']) expect(intentForKey({key}, {raiseOpen: true})).toBeNull();
        for (const key of ['f', 'c', 'r', 'a', '1', 'Enter']) expect(roomIntentForKey({key})).toBeNull();
    });

    it('list every key once, the moves first, each as aria-keyshortcuts names it', () => {
        const ids = [...SHORTCUTS.turn, ...SHORTCUTS.table].map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(SHORTCUTS.table.map((s) => s.id)).toEqual(Object.keys(ROOM_KEY_SHORTCUTS));
        for (const s of SHORTCUTS.table) expect(s.keys).toEqual([ROOM_KEY_SHORTCUTS[s.id]]);
        for (const id of ['fold', 'check-call', 'raise', 'all-in'] as const) {
            expect(SHORTCUTS.turn.find((s) => s.id === id)?.keys).toEqual([KEY_SHORTCUTS[id]]);
        }
    });
});

// The tap shield: a row of buttons that takes another's place drops a pointer tap landing within
// TAP_SHIELD_MS of it appearing.
describe('the tap shield', () => {
    it('drops a tap that lands before the shield is over, and lets one through from then on', () => {
        expect(TAP_SHIELD_MS).toBe(350);
        expect(tapLands(1000, 1000)).toBe(false);
        expect(tapLands(1000, 1100)).toBe(false);
        expect(tapLands(1000, 1349.9)).toBe(false);
        expect(tapLands(1000, 1350)).toBe(true);
        expect(tapLands(1000, 5000)).toBe(true);
    });
});
