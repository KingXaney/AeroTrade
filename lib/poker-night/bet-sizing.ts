// How the raise panel sizes a bet or a raise: the quick sizes (min, ½ pot, ¾ pot, pot, all in),
// the slider and the amount field. Pure and client-safe. The limits are the server's own:
// legalFor(snapshotFromView(view), seat) gives the smallest and largest "raise to" (street totals),
// so the panel never re-derives the minimum-raise rule, it only clamps to it.
//
// A pot-sized raise is the current bet plus the pot after calling: every pot, every bet in front of
// the players, and the call. With nothing to call it is a share of the pot, a bet. Sizes are rounded
// to the table's unit (its small blind), and one at or past the stack is the all-in. The ids are
// ACTION_COPY.sizes' keys in lib/learn/copy/poker-night.

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
    max: number; // the largest: the all-in
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
    return {
        kind: legal.raise.kind, min: legal.raise.min, max: legal.raise.max,
        currentBet: view.hand.currentBet, myBet: view.seats[seat]?.bet ?? 0, toCall: legal.call,
        pot: potTotal(view), unit: Math.max(1, Math.floor(unit)),
    };
};

// A "raise to" held to the legal range, rounded to the unit inside it; the top of the range is the
// all-in and is never rounded away.
export const clampTo = (to: number, s: Pick<Sizing, 'min' | 'max' | 'unit'>): number => {
    if (!Number.isFinite(to) || to >= s.max) return s.max;
    if (to <= s.min) return s.min;
    const rounded = Math.round(to / s.unit) * s.unit;
    return Math.min(s.max, Math.max(s.min, rounded));
};

// The raise to `share` of the pot after the call.
export const potRaise = (s: Sizing, share: number): number => clampTo(s.currentBet + share * (s.pot + s.toCall), s);

// The quick sizes on offer, smallest first, none twice: the minimum, the pot shares, the all-in.
// A size that reaches the stack is the all-in; when the minimum is the all-in it is the only one.
export const quickSizes = (s: Sizing): QuickSize[] => {
    if (s.min >= s.max) return [{id: 'all-in', to: s.max}];
    const out: QuickSize[] = [{id: 'min', to: s.min}];
    for (const id of ['half', 'three-quarters', 'pot'] as const) {
        const to = potRaise(s, POT_SHARE[id]);
        if (to >= s.max) break;
        if (to > out[out.length - 1].to) out.push({id, to});
    }
    out.push({id: 'all-in', to: s.max});
    return out;
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
