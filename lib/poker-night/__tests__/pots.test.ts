// Poker night's pots: the uncalled bet, main and side pots, and how a pot splits. Named hands pin
// the cases a table meets (stacked all-ins, a folded caller's chips, an ante-only all-in, the small
// blind folding to a short big blind), and 10,000 seeded inputs are held to a naive reference that
// walks the chips one at a time — every chip level, who paid it, who can still win it.

import {describe, expect, it} from 'vitest';
import {buildPots, splitPot, uncalled, type Contribution, type Pot} from '@/lib/poker-night/pots';
import {mulberry32} from '@/lib/random';

const live = (seat: number, amount: number): Contribution => ({seat, amount, folded: false});
const folded = (seat: number, amount: number): Contribution => ({seat, amount, folded: true});

const sameSeats = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((s, i) => s === b[i]);

// Chip by chip: the nth chip of every seat that put in at least n forms one slice, open to the live
// seats that did. A slice joins the pot before it when the same seats can win it, or when no live
// seat can.
const naivePots = (contribs: readonly Contribution[]): Pot[] => {
    const pots: Pot[] = [];
    const top = Math.max(0, ...contribs.map((c) => c.amount));
    for (let chip = 1; chip <= top; chip++) {
        const paid = contribs.filter((c) => c.amount >= chip).length;
        const eligible = contribs.filter((c) => !c.folded && c.amount >= chip).map((c) => c.seat);
        const last = pots[pots.length - 1];
        if (last && (eligible.length === 0 || sameSeats(last.eligible, eligible))) last.amount += paid;
        else pots.push({amount: paid, eligible});
    }
    return pots;
};

// The uncalled bet by sorting: the top's lead over the next, when the top is alone.
const naiveUncalled = (contribs: readonly Contribution[]): {seat: number; amount: number} | null => {
    const sorted = [...contribs].sort((a, b) => b.amount - a.amount);
    if (sorted.length === 0) return null;
    const lead = sorted[0].amount - (sorted[1]?.amount ?? 0);
    return lead > 0 ? {seat: sorted[0].seat, amount: lead} : null;
};

const total = (pots: readonly Pot[]) => pots.reduce((sum, pot) => sum + pot.amount, 0);

// The refund taken back off the top committer.
const afterRefund = (contribs: readonly Contribution[]): Contribution[] => {
    const refund = uncalled(contribs);
    return contribs.map((c) => (refund && c.seat === refund.seat ? {...c, amount: c.amount - refund.amount} : c));
};

describe('named hands', () => {
    it('layers three all-ins of 100, 200 and 300 and a caller of 300', () => {
        const hand = [live(0, 100), live(1, 200), live(2, 300), live(3, 300)];
        expect(uncalled(hand)).toBeNull();
        expect(buildPots(hand)).toEqual([{amount: 400, eligible: [0, 1, 2, 3]}, {amount: 300, eligible: [1, 2, 3]}, {amount: 200, eligible: [2, 3]}]);
    });

    it('layers all-ins of 100, 300 and 500 and a caller into 400, 600 and 400', () => {
        const hand = [live(4, 100), live(6, 300), live(1, 500), live(2, 500)];
        expect(buildPots(hand)).toEqual([{amount: 400, eligible: [4, 6, 1, 2]}, {amount: 600, eligible: [6, 1, 2]}, {amount: 400, eligible: [1, 2]}]);
    });

    it('keeps the chips of a folded seat in the pot without making it eligible', () => {
        // C called 100 and folded to a later bet: one pot, C's chips in it.
        expect(buildPots([live(0, 300), live(1, 300), folded(2, 100)])).toEqual([{amount: 700, eligible: [0, 1]}]);
        // C matched B's 200 and folded over A's all-in for 50: the side pot holds C's chips and is B's alone.
        const hand = [live(0, 50), live(1, 200), folded(2, 200)];
        expect(uncalled(hand)).toBeNull();
        expect(buildPots(hand)).toEqual([{amount: 150, eligible: [0, 1]}, {amount: 300, eligible: [1]}]);
    });

    it('opens a main pot for an all-in on the ante alone', () => {
        // Ante 10, blinds 10/20, in hand order: the small blind (calls to 30), the big blind (30), and
        // the button with 5 chips, all in on the ante.
        const hand = [live(1, 30), live(2, 30), live(0, 5)];
        expect(uncalled(hand)).toBeNull();
        expect(buildPots(hand)).toEqual([{amount: 15, eligible: [1, 2, 0]}, {amount: 50, eligible: [1, 2]}]);
    });

    it('makes one pot of equal stacks', () => {
        const hand = [live(0, 500), live(1, 500), live(2, 500)];
        expect(uncalled(hand)).toBeNull();
        expect(buildPots(hand)).toEqual([{amount: 1500, eligible: [0, 1, 2]}]);
    });

    it('gives the small blind back what a short big blind could not match when it folds', () => {
        // Blinds 25/50, the big blind all in for 10, the small blind folds: 15 comes back, the big
        // blind wins 20.
        const hand = [folded(0, 25), live(1, 10)];
        expect(uncalled(hand)).toEqual({seat: 0, amount: 15});
        expect(buildPots(afterRefund(hand))).toEqual([{amount: 20, eligible: [1]}]);
    });

    it('gives a walk back to the big blind', () => {
        const hand = [folded(3, 10), live(5, 20), folded(7, 0)];
        expect(uncalled(hand)).toEqual({seat: 5, amount: 10});
        expect(buildPots(afterRefund(hand))).toEqual([{amount: 20, eligible: [5]}]);
    });

    it('makes nothing of nothing, and makes no live seat that put nothing in eligible', () => {
        expect(buildPots([])).toEqual([]);
        expect(buildPots([live(0, 0), live(1, 0)])).toEqual([]);
        expect(buildPots([live(0, 0), live(1, 40), live(2, 40)])).toEqual([{amount: 80, eligible: [1, 2]}]);
    });

    it('folds a layer only folded seats reached into the pot below it', () => {
        expect(buildPots([live(0, 100), folded(1, 300)])).toEqual([{amount: 400, eligible: [0]}]);
        expect(buildPots([live(0, 100), live(1, 200), folded(2, 400)])).toEqual([{amount: 300, eligible: [0, 1]}, {amount: 400, eligible: [1]}]);
        // With nobody live, every chip lands in one pot that nobody is eligible for.
        expect(buildPots([folded(0, 50), folded(1, 80)])).toEqual([{amount: 130, eligible: []}]);
    });

    it('refuses chips that are not whole, non-negative and safe', () => {
        for (const amount of [-1, 1.5, Number.NaN, Infinity, 2 ** 53]) {
            expect(() => buildPots([live(0, amount)]), String(amount)).toThrow(RangeError);
            expect(() => uncalled([live(0, amount)]), String(amount)).toThrow(RangeError);
        }
    });
});

describe('uncalled', () => {
    it('returns the lead of the unique top committer over the next, folded seats counting', () => {
        expect(uncalled([live(0, 300), folded(1, 120), live(2, 50)])).toEqual({seat: 0, amount: 180});
        expect(uncalled([live(2, 50), folded(1, 120), live(0, 300)])).toEqual({seat: 0, amount: 180});
        expect(uncalled([folded(4, 200), live(1, 60)])).toEqual({seat: 4, amount: 140});
        expect(uncalled([live(6, 40)])).toEqual({seat: 6, amount: 40});
    });

    it('returns null on a tie at the top, folded or not, and when nothing is in', () => {
        expect(uncalled([live(0, 300), live(1, 300), live(2, 50)])).toBeNull();
        expect(uncalled([live(0, 300), folded(1, 300)])).toBeNull();
        expect(uncalled([live(0, 0), live(1, 0)])).toBeNull();
        expect(uncalled([])).toBeNull();
    });
});

describe('against the chip-by-chip reference', () => {
    it('agrees on 10,000 seeded hands, and the totals and refunds hold', () => {
        const random = mulberry32(2026);
        const int = (n: number) => Math.floor(random() * n);
        for (let t = 0; t < 10_000; t++) {
            // Seats in a shuffled hand order, so eligibility must follow the input, not seat numbers.
            const seats = Array.from({length: 9}, (_, i) => i);
            for (let i = 8; i > 0; i--) {
                const j = int(i + 1);
                [seats[i], seats[j]] = [seats[j], seats[i]];
            }
            // A few shared levels, so ties and repeated all-ins come up often.
            const levels = Array.from({length: 1 + int(4)}, () => int(400));
            const hand = seats.slice(0, 2 + int(8)).map((seat): Contribution => ({
                seat,
                amount: random() < 0.6 ? levels[int(levels.length)] : int(400),
                folded: random() < 0.35,
            }));
            const label = JSON.stringify(hand);
            const pots = buildPots(hand);
            expect(pots, label).toEqual(naivePots(hand));
            expect(total(pots), label).toBe(hand.reduce((sum, c) => sum + c.amount, 0));
            const liveOrder = hand.filter((c) => !c.folded).map((c) => c.seat);
            for (const pot of pots) {
                expect(pot.amount, label).toBeGreaterThan(0);
                expect(pot.eligible, label).toEqual(liveOrder.filter((seat) => pot.eligible.includes(seat)));
            }
            const refund = uncalled(hand);
            expect(refund, label).toEqual(naiveUncalled(hand));
            const rest = afterRefund(hand);
            expect(uncalled(rest), label).toBeNull();
            expect(total(buildPots(rest)) + (refund?.amount ?? 0), label).toBe(total(pots));
            expect(buildPots(rest), label).toEqual(naivePots(rest));
        }
    }, 30_000);
});

describe('splitPot', () => {
    it('shares a pot evenly, the odd chips to the first winners in order', () => {
        expect(splitPot(101, [3, 5])).toEqual([51, 50]);
        expect(splitPot(100, [4, 1, 2])).toEqual([34, 33, 33]);
        expect(splitPot(2, [0, 1, 2])).toEqual([1, 1, 0]);
        expect(splitPot(7, [6])).toEqual([7]);
        expect(splitPot(0, [1, 2])).toEqual([0, 0]);
    });

    it('sums to the pot, with shares at most one chip apart, on 10,000 seeded splits', () => {
        const random = mulberry32(7);
        for (let t = 0; t < 10_000; t++) {
            const amount = Math.floor(random() * 10_000_000);
            const k = 1 + Math.floor(random() * 9);
            const shares = splitPot(amount, Array.from({length: k}, (_, i) => i));
            expect(shares).toHaveLength(k);
            expect(shares.reduce((a, b) => a + b, 0)).toBe(amount);
            expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
            expect(shares.every((share, i) => Number.isSafeInteger(share) && (i === 0 || share <= shares[i - 1]))).toBe(true);
            expect(shares.filter((share) => share > Math.floor(amount / k))).toHaveLength(amount % k);
        }
    });

    it('refuses a pot with no winner or chips that are not whole', () => {
        expect(() => splitPot(10, [])).toThrow(RangeError);
        expect(() => splitPot(-1, [0])).toThrow(RangeError);
        expect(() => splitPot(1.5, [0])).toThrow(RangeError);
    });
});
