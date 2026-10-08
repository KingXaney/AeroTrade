// The table's single-key shortcuts: F folds, C checks or calls, R opens the raise panel, A sets the
// all-in; with the panel open, 1–4 pick a quick size, Enter confirms and Escape closes it. Pure and
// client-safe: the action bar reads each keydown through intentForKey and labels every button with
// its key (aria-keyshortcuts, KEY_SHORTCUTS).
//
// Nothing fires with ⌘, Ctrl or Alt held, on a key held down, or while focus is in a field the
// player is typing into — except Enter and Escape in the raise panel's amount field, which commit
// and close it (as lib/games' arithmetic round does with its keys). Enter on a button, a link or a
// menu item is that control's own: it never confirms the raise. The action bar also turns the keys
// off when the player has (My look, "Single-key shortcuts"), and listens only while the focus is
// on the table itself (shortcutScope): never in the top bar, a drawer or a dialog (WCAG 2.1.4).

export type TableIntent = 'fold' | 'check-call' | 'raise' | 'all-in' | 'size-1' | 'size-2' | 'size-3' | 'size-4' | 'confirm' | 'close';

export type KeyInput = {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
    editable?: boolean; // focus is in a text field (isEditableTarget)
    control?: boolean; // focus is on a button, a link or a menu item (isControlTarget)
};

const LETTERS: Record<string, TableIntent> = {f: 'fold', c: 'check-call', r: 'raise', a: 'all-in'};
const SIZES: Record<string, TableIntent> = {'1': 'size-1', '2': 'size-2', '3': 'size-3', '4': 'size-4'};

// The keys as aria-keyshortcuts names them.
export const KEY_SHORTCUTS = {fold: 'F', 'check-call': 'C', raise: 'R', 'all-in': 'A', confirm: 'Enter', close: 'Escape'} as const;

export const intentForKey = (e: KeyInput, ctx: {raiseOpen?: boolean} = {}): TableIntent | null => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
    const open = ctx.raiseOpen === true;
    // Enter on a focused control activates it (Back, Fold, a quick size), never the raise.
    if (e.key === 'Enter') return open && !e.control ? 'confirm' : null;
    if (e.key === 'Escape' || e.key === 'Esc') return open ? 'close' : null;
    if (e.editable) return null;
    if (open && SIZES[e.key]) return SIZES[e.key];
    if (e.key.length !== 1) return null;
    return LETTERS[e.key.toLowerCase()] ?? null;
};

// ── the tap shield ──

// A row of buttons that takes another's place under the thumb — the action bar as the turn starts,
// the seat's own controls as a hand ends — drops a pointer tap that lands within TAP_SHIELD_MS of
// it appearing: that tap was aimed at what was there before (a "Check" early choice that became
// "Call 80"). The row marks itself armed (data-pn-armed) once the shield is over. Keys and a
// keyboard's click (event.detail 0) are never shielded.
export const TAP_SHIELD_MS = 350;

// Whether a pointer tap at `at` (ms, the event's own time) lands, for a row shown at `shownAt`.
export const tapLands = (shownAt: number, at: number): boolean => at - shownAt >= TAP_SHIELD_MS;

// Input types a player types text into; a range, a checkbox or a button is not one.
const TEXT_INPUTS = new Set(['text', 'number', 'search', 'email', 'password', 'tel', 'url', '']);

type TargetLike = {tagName?: unknown; isContentEditable?: unknown; type?: unknown; readOnly?: unknown} | null | undefined;

// Whether a keydown's target is a field being typed into.
export const isEditableTarget = (target: unknown): boolean => {
    const t = target as TargetLike;
    if (!t || typeof t !== 'object') return false;
    if (t.isContentEditable === true) return true;
    const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const type = typeof t.type === 'string' ? t.type.toLowerCase() : '';
    return TEXT_INPUTS.has(type) && t.readOnly !== true;
};

// Elements whose own Enter or Space activation a shortcut must leave alone.
const CONTROL_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
const CONTROL_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'color']);
const CONTROL_ROLES = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab', 'switch', 'checkbox', 'radio']);

type ControlLike = TargetLike & {getAttribute?: unknown};

// Whether a keydown's target is a button, a link, a menu item or another control that acts on Enter.
export const isControlTarget = (target: unknown): boolean => {
    const t = target as ControlLike;
    if (!t || typeof t !== 'object') return false;
    const role = typeof t.getAttribute === 'function' ? (t.getAttribute as (name: string) => unknown).call(t, 'role') : null;
    if (typeof role === 'string' && CONTROL_ROLES.has(role.toLowerCase())) return true;
    const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
    if (CONTROL_TAGS.has(tag)) return true;
    return tag === 'INPUT' && typeof t.type === 'string' && CONTROL_INPUTS.has(t.type.toLowerCase());
};

// Where the focus is when a key goes down, as the action bar reads it: on the table itself (the
// page's body, the felt, the dock with its action bar and raise panel), or anywhere else — the top
// bar, a drawer, a dialog, a menu — where a letter must not fold a hand.
export type FocusPlace = 'body' | 'table' | 'elsewhere';

// Whether a key may act: only with the focus on the table itself; a single character (a letter, 1–4)
// only while the player keeps the shortcuts on — Enter and Escape in the raise panel always.
export const keyAllowed = (key: string, place: FocusPlace, enabled: boolean): boolean => place !== 'elsewhere' && (enabled || key.length !== 1);

// ── the room's own keys (P6) ──

// Beside the moves: E opens the emotes, L the hand log, B the bank, H the Hands guide (the rankings
// and the game's rules), M turns the table's sounds on or off, and ? lists every key
// (components/poker-night/useHotkeys, under the same rules: never with ⌘, Ctrl or Alt, never on a
// held key or while typing, only with the focus on the table and only while the player keeps the
// single-key shortcuts on).
export type RoomIntent = 'emotes' | 'log' | 'bank' | 'hands' | 'mute' | 'shortcuts';

const ROOM_KEYS: Record<string, RoomIntent> = {e: 'emotes', l: 'log', b: 'bank', h: 'hands', m: 'mute', '?': 'shortcuts'};

export const roomIntentForKey = (e: KeyInput): RoomIntent | null => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.editable) return null;
    if (e.key.length !== 1) return null;
    return ROOM_KEYS[e.key.toLowerCase()] ?? null;
};

// The keys as aria-keyshortcuts names them.
export const ROOM_KEY_SHORTCUTS = {emotes: 'E', log: 'L', bank: 'B', hands: 'H', mute: 'M', shortcuts: '?'} as const satisfies Record<RoomIntent, string>;

// Every key the table answers, as the shortcuts list shows them (components/poker-night
// ShortcutsDialog; lib/learn/copy/poker-night SHORTCUTS_COPY words each id): on the player's turn,
// then anywhere at the table.
export const SHORTCUTS = {
    turn: [
        {id: 'fold', keys: ['F']}, {id: 'check-call', keys: ['C']}, {id: 'raise', keys: ['R']}, {id: 'all-in', keys: ['A']},
        {id: 'sizes', keys: ['1', '2', '3', '4']}, {id: 'confirm', keys: ['Enter']}, {id: 'close', keys: ['Esc']},
    ],
    table: [
        {id: 'emotes', keys: ['E']}, {id: 'log', keys: ['L']}, {id: 'bank', keys: ['B']}, {id: 'hands', keys: ['H']}, {id: 'mute', keys: ['M']},
        {id: 'shortcuts', keys: ['?']},
    ],
} as const;

export type ShortcutGroup = keyof typeof SHORTCUTS;
export type ShortcutId = (typeof SHORTCUTS)[ShortcutGroup][number]['id'];
