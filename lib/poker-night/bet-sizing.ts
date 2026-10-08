// How the raise panel sizes a bet or a raise: the quick sizes (min, ½ pot, ¾ pot, pot, all in),
// the slider and the amount field. Pure and client-safe. The limits are the server's own:
// legalFor(snapshotFromView(view), seat) gives the smallest and largest "raise to" (street totals),
// so the panel never re-derives the minimum-raise rule, it only clamps to it.
//
// A pot-sized raise is the current bet plus the pot after calling: every pot, every bet in front of
// the players, and the call. With nothing to call it is a share of the pot, a bet. Sizes are rounded
// to the table's unit (its small blind), and one at or past the top of the range is the top. Under
// pot limit (PLO) the top is the pot itself whenever the stack goes past it (cap 'pot'): the last
// quick size is then Pot, the confirm reads "Raise to 340 (pot)", and the move sent is a raise to it —
// never the all-in, which the server takes only within the cap. The ids are ACTION_COPY.sizes' keys
// in lib/learn/copy/poker-night.

import {ACTION_COPY} from '@/lib/learn/copy/poker-night';
import type {Legal} from '@/lib/poker-night/types';
import type {TableView} from '@/lib/poker-night/view-types';

export const QUICK_SIZE_IDS = ['min', 'half', 'three-quarters', 'pot', 'all-in'] as const;
export type QuickSizeId = (typeof QUICK_SIZE_IDS)[number];
export type QuickSize = {id: QuickSizeId; to: number};

// The shares of the pot the middle sizes are.
const POT_SHARE: Record<'half' | 'three-quarters' | 'pot', number> = {half: 0.5, 'three-quarters': 0.75, pot: 1};

// The slider's positions: 0 is the minimum, SLIDER_MAX the all-in, on a square curve so the small
// end, where most raises are, gets most of the travel.
export const SLIDER_MAX = 1000;

export type Sizing = {
    kind: 'bet' | 'raise';
    min: number; // the smallest "raise to"
    max: number; // the largest: the all-in, or under pot limit the pot when the stack goes past it
    cap: 'all-in' | 'pot'; // what the largest is
    currentBet: number;
    myBet: number; // the seat's own bet on this street
    toCall: number;
    pot: number; // every pot and every bet in front of the players
    unit: number; // sizes are rounded to this (the small blind)
};

// Everything in the middle and in front of the players.
export const potTotal = (view: Pick<TableView, 'hand' | 'seats'>): number => {
    if (!view.hand) return 0;
    const pots = view.hand.pots.reduce((sum, p) => sum + p.amount, 0);
    const bets = view.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0);
    return pots + bets;
};

// The sizing for `seat` from its legal moves, or null when it may not bet or raise.
export const sizingFor = (view: Pick<TableView, 'hand' | 'seats'>, legal: Legal | null, seat: number | null, unit: number): Sizing | null => {
    if (!legal?.raise || seat === null || !view.hand) return null;
    const own = view.seats[seat];
    const allInTo = (own?.chips ?? 0) + (own?.bet ?? 0);
    return {
        kind: legal.raise.kind, min: legal.raise.min, max: legal.raise.max, cap: legal.raise.max < allInTo ? 'pot' : 'all-in',
        currentBet: view.hand.currentBet, myBet: own?.bet ?? 0, toCall: legal.call,
        pot: potTotal(view), unit: Math.max(1, Math.floor(unit)),
    };
};

// A "raise to" held to the legal range, rounded to the unit inside it; the top of the range (the
// all-in, or the pot) is never rounded away.
export const clampTo = (to: number, s: Pick<Sizing, 'min' | 'max' | 'unit'>): number => {
    if (!Number.isFinite(to) || to >= s.max) return s.max;
    if (to <= s.min) return s.min;
    const rounded = Math.round(to / s.unit) * s.unit;
    return Math.min(s.max, Math.max(s.min, rounded));
};

// The raise to `share` of the pot after the call.
export const potRaise = (s: Pick<Sizing, 'min' | 'max' | 'unit' | 'currentBet' | 'pot' | 'toCall'>, share: number): number => clampTo(s.currentBet + share * (s.pot + s.toCall), s);

// The quick sizes on offer, smallest first, none twice: the minimum, the pot shares, then the top —
// the all-in, or under pot limit the pot. A size that reaches the top is the top; when the minimum is
// the top it is the only one.
export const quickSizes = (s: Sizing): QuickSize[] => {
    const top: QuickSize = {id: s.cap === 'pot' ? 'pot' : 'all-in', to: s.max};
    if (s.min >= s.max) return [top];
    const out: QuickSize[] = [{id: 'min', to: s.min}];
    for (const id of ['half', 'three-quarters', 'pot'] as const) {
        const to = potRaise(s, POT_SHARE[id]);
        if (to >= s.max) break;
        if (to > out[out.length - 1].to) out.push({id, to});
    }
    out.push(top);
    return out;
};

// The move a confirmed "raise to" sends: the all-in at the top of a no-limit range (or of a pot-limit
// one the stack fits under), else a raise to it — the pot's cap included.
export const moveFor = (s: Pick<Sizing, 'max' | 'cap'>, to: number): {kind: 'all-in'} | {kind: 'raise'; to: number} =>
    to >= s.max && s.cap === 'all-in' ? {kind: 'all-in'} : {kind: 'raise', to: Math.min(to, s.max)};

// The confirm button's words for a "raise to": the top of the range says what it is — all in, or the pot.
export const confirmLabel = (sizing: Pick<Sizing, 'kind' | 'max' | 'cap'>, to: number): string => {
    if (to >= sizing.max) {
        if (sizing.cap === 'all-in') return ACTION_COPY.allIn(sizing.max);
        return sizing.kind === 'bet' ? ACTION_COPY.potBet(sizing.max) : ACTION_COPY.potRaise(sizing.max);
    }
    return sizing.kind === 'bet' ? ACTION_COPY.bet(to) : ACTION_COPY.raiseTo(to);
};

// A slider position (0..SLIDER_MAX) as a "raise to", and back.
export const sliderToAmount = (pos: number, s: Pick<Sizing, 'min' | 'max' | 'unit'>): number => {
    const p = Math.min(SLIDER_MAX, Math.max(0, Math.round(pos))) / SLIDER_MAX;
    if (p >= 1) return s.max;
    return clampTo(s.min + (s.max - s.min) * p * p, s);
};

export const amountToSlider = (amount: number, s: Pick<Sizing, 'min' | 'max'>): number => {
    if (s.max <= s.min || amount >= s.max) return SLIDER_MAX;
    if (amount <= s.min) return 0;
    return Math.round(Math.sqrt((amount - s.min) / (s.max - s.min)) * SLIDER_MAX);
};

// A chip count as typed: "1,250", " 300 ", "1.5k", "2M". Null for anything else, and for zero.
export const parseChips = (text: string): number | null => {
    const t = text.trim().replace(/[\s_]/g, '').toLowerCase();
    // Commas only as thousands groups.
    if (t.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?[km]?$/.test(t)) return null;
    const m = /^(\d+(?:\.\d+)?|\.\d+)([km])?$/.exec(t.replace(/,/g, ''));
    if (!m) return null;
    const n = Number(m[1]) * (m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1);
    if (!Number.isFinite(n)) return null;
    const whole = Math.round(n);
    return Math.abs(n - whole) < 1e-9 && whole > 0 && Number.isSafeInteger(whole) ? whole : null;
};
