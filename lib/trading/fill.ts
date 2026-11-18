// The fill arithmetic, written once: what a market fill of whole shares at a price does to an
// account's cash and positions. Pure. executeOrder (every live fill — the learner's ticket, the
// AI Navigator, the quant strategies' job), the strategy simulator and the fill receipts all go
// through it, so a live fill, a simulated fill and a replayed receipt move an account identically.
//
// Whole shares, long-only. Rejections come in a fixed order: quantity, price, cash, cash floor,
// holding. A buy averages its cost into the position (VWAP); a sell books (price − average cost)
// × shares as realised P&L; a position sold to zero is dropped. Never mutates its input.
//
// A holding itself may carry a fraction of a share: a split leaves one (lib/trading/splits.ts).
// Orders stay whole shares, so a sell that would leave less than one share sells the fraction
// with it, and a holding of less than one share sells as one. The result says how many shares
// moved. `exact` is for a replay of stored fills (the receipts, a ledger restated after a
// split): the quantity is moved as written, fraction and all.
//
// Symbols match exactly. executeOrder upper-cases the order's symbol and looks the holding up
// case-insensitively, then fills under the holding's own spelling, so a stored position keeps it.

type SimPosition = {
    symbol: string;
    quantity: number;
    avgCost: number;
    // A live account's display name for the holding; simulated and replayed positions carry none.
    company?: string;
};

export type SimAccount = {cash: number; positions: SimPosition[]};

type FillOrder = {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    // A buy stamps this on the position it opens or adds to (a live fill's company profile);
    // a sell leaves the position's own.
    company?: string;
};

export type FillRejection = 'invalid quantity' | 'no price' | 'insufficient cash' | 'cash floor' | 'not held';

type FillResult =
    | {ok: true; account: SimAccount; realizedPnl?: number; total: number; quantity: number}
    | {ok: false; reason: FillRejection};

// Below this a quantity is float noise (a ratio's rounding), not shares.
export const SHARE_EPSILON = 1e-9;

export const applyFill = (
    account: SimAccount,
    order: FillOrder,
    price: number,
    minCashAfter?: number,
    {exact = false}: {exact?: boolean} = {},
): FillResult => {
    const requested = Number(order.quantity);
    const qty = exact ? requested : Math.floor(requested);
    if (!Number.isFinite(qty) || qty <= 0) {
        return {ok: false, reason: 'invalid quantity'};
    }
    if (typeof price !== 'number' || !(price > 0)) {
        return {ok: false, reason: 'no price'};
    }
    const positions = account.positions.map((position) => ({...position}));
    let cash = account.cash;
    let realizedPnl: number | undefined;
    let moved = qty;
    const existing = positions.find((position) => position.symbol === order.symbol);

    if (order.side === 'buy') {
        const total = qty * price;
        if (total > cash) {
            return {ok: false, reason: 'insufficient cash'};
        }
        if (typeof minCashAfter === 'number' && cash - total < minCashAfter) {
            return {ok: false, reason: 'cash floor'};
        }
        if (existing) {
            const newQty = existing.quantity + qty;
            existing.avgCost = (existing.avgCost * existing.quantity + price * qty) / newQty;
            existing.quantity = newQty;
            if (order.company !== undefined) existing.company = order.company;
        } else {
            positions.push({
                symbol: order.symbol,
                quantity: qty,
                avgCost: price,
                ...(order.company !== undefined ? {company: order.company} : {}),
            });
        }
        cash -= total;
    } else {
        if (!existing) {
            return {ok: false, reason: 'not held'};
        }
        if (exact) {
            if (qty > existing.quantity + SHARE_EPSILON) return {ok: false, reason: 'not held'};
            moved = Math.min(qty, existing.quantity);
        } else {
            const whole = Math.floor(existing.quantity + SHARE_EPSILON);
            const fraction = existing.quantity - whole > SHARE_EPSILON;
            // The ticket's smallest order is one share, so a holding of less than one sells as one.
            if (qty > Math.max(whole, fraction ? 1 : 0)) return {ok: false, reason: 'not held'};
            // Less than one share would be left (with the noise allowed for: 1.9999999999999998
            // held and one sold leaves a share, not a fraction of one).
            if (existing.quantity - qty < 1 - SHARE_EPSILON) moved = existing.quantity;
        }
        realizedPnl = (price - existing.avgCost) * moved;
        existing.quantity -= moved;
        cash += moved * price;
    }

    return {
        ok: true,
        account: {cash, positions: positions.filter((position) => position.quantity > SHARE_EPSILON)},
        ...(realizedPnl !== undefined ? {realizedPnl} : {}),
        total: moved * price,
        quantity: moved,
    };
};
