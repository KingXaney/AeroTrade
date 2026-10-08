// Pots for poker night: the uncalled bet, the main and side pots, and how a pot splits. Pure and
// import-free; integer chips only.
//
// A contribution is what one dealt seat has put in this hand (antes, blinds and bets) and whether it
// has folded, listed in hand order: clockwise from the seat after the button. The order carries
// through, so a pot's eligible seats, and the winners the engine passes to splitPot, are in hand
// order too, and the odd chip of a split goes to the first winner left of the button.
//
// Closing a hand runs them in this order: uncalled first (the unique top committer gets back what
// nobody matched, even a folded one), then buildPots over what is left, then each pot split between
// the boards (splitBoards: one part on a single board) and each part between its board's winners
// (splitPot). paidParts rebuilds the shares from the winners alone, so the wire carries only those.

export type Contribution = {seat: number; amount: number; folded: boolean};
export type Pot = {amount: number; eligible: number[]};
// winners[k] and shares[k]: board k's part of the pot, its winners in hand order and their shares.
export type SettledPot = Pot & {winners: number[][]; shares: number[][]};

const checkAmounts = (contribs: readonly Contribution[]) => {
    for (const {seat, amount} of contribs) {
        if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`seat ${seat} contributed ${amount}`);
    }
};

// The excess of the unique top committer over the second-highest commitment, folded seats counting
// as second; null when two or more share the top (or nothing is in).
export const uncalled = (contribs: readonly Contribution[]): {seat: number; amount: number} | null => {
    checkAmounts(contribs);
    let top: Contribution | null = null;
    let second = 0;
    for (const contrib of contribs) {
        if (top === null || contrib.amount > top.amount) {
            if (top !== null) second = top.amount;
            top = contrib;
        } else if (contrib.amount > second) {
            second = contrib.amount;
        }
    }
    if (top === null || top.amount === second) return null;
    return {seat: top.seat, amount: top.amount - second};
};

const sameSeats = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((seat, i) => seat === b[i]);

// The pots, after the uncalled bet has come back. Each distinct contribution level closes a layer:
// every seat puts in what it committed between the previous level and this one, folded seats
// included, and the seats still in with at least this level are eligible for it. A layer with the
// same eligible seats as the pot before it joins that pot, and so does a layer nobody live reached
// (only folded chips, which a refund normally leaves none of). With no live contributor at all, the
// chips form one pot nobody is eligible for, so the total still matches.
export const buildPots = (contribs: readonly Contribution[]): Pot[] => {
    checkAmounts(contribs);
    const levels = [...new Set(contribs.map((c) => c.amount).filter((amount) => amount > 0))].sort((a, b) => a - b);
    const pots: Pot[] = [];
    let previous = 0;
    for (const level of levels) {
        let amount = 0;
        for (const c of contribs) amount += Math.min(c.amount, level) - Math.min(c.amount, previous);
        const eligible = contribs.filter((c) => !c.folded && c.amount >= level).map((c) => c.seat);
        const last = pots[pots.length - 1];
        if (last && (eligible.length === 0 || sameSeats(last.eligible, eligible))) last.amount += amount;
        else pots.push({amount, eligible});
        previous = level;
    }
    return pots;
};

// One pot shared among its winners, given in hand order: an equal share each, rounded down, and the
// chips left over one each to the first winners. The shares line up with the winners.
export const splitPot = (amount: number, winnersInOrder: readonly number[]): number[] => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`cannot split ${amount}`);
    const k = winnersInOrder.length;
    if (k === 0) throw new RangeError('a pot needs at least one winner');
    const base = Math.floor(amount / k);
    const odd = amount - base * k;
    return winnersInOrder.map((_, i) => base + (i < odd ? 1 : 0));
};

// A pot split between b boards: an equal part each, rounded down, and the odd chips one each to the
// first boards (board 1, then board 2). A part may be 0 when the pot holds fewer chips than boards.
export const splitBoards = (amount: number, boards: number): number[] => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`cannot split ${amount}`);
    if (!Number.isInteger(boards) || boards < 1) throw new RangeError(`a pot splits over at least one board, not ${boards}`);
    const base = Math.floor(amount / boards);
    const odd = amount - base * boards;
    return Array.from({length: boards}, (_, k) => base + (k < odd ? 1 : 0));
};

export type PaidPart = {board: number; amount: number; winners: number[]; shares: number[]};

// A paid pot board by board, from its amount and each board's winners (one list per board): the
// part each board holds and the shares of its winners — the server's own split, so a browser that
// is sent only the winners works out the same chips.
export const paidParts = (pot: {amount: number; winners: readonly (readonly number[])[]}): PaidPart[] => {
    const parts = splitBoards(pot.amount, pot.winners.length);
    return pot.winners.map((winners, board) => ({board, amount: parts[board], winners: [...winners], shares: splitPot(parts[board], winners)}));
};

// What a paid pot gave each seat over every board, in the order the seats first win a part.
export const seatShares = (pot: {amount: number; winners: readonly (readonly number[])[]}): {seat: number; share: number}[] => {
    const out = new Map<number, number>();
    for (const part of paidParts(pot)) part.winners.forEach((seat, j) => out.set(seat, (out.get(seat) ?? 0) + part.shares[j]));
    return [...out].map(([seat, share]) => ({seat, share}));
};
