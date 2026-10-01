// The fill arithmetic, written once: what a market fill of whole shares at a price does to an
// account's cash and positions. Pure. executeOrder (every live fill — the learner's ticket, the
// AI Navigator, the quant strategies' job), the strategy simulator and the fill receipts all go
// through it, so a live fill, a simulated fill and a replayed receipt move an account identically.
//
// Whole shares, long-only. Rejections come in a fixed order: quantity, price, cash, cash floor,
// holding. A buy averages its cost into the position (VWAP); a sell books (price − average cost)
// × shares as realised P&L; a position sold to zero is dropped. Never mutates its input.
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
    | {ok: true; account: SimAccount; realizedPnl?: number; total: number}
    | {ok: false; reason: FillRejection};

export const applyFill = (
    account: SimAccount,
    order: FillOrder,
    price: number,
    minCashAfter?: number,
): FillResult => {
    const qty = Math.floor(Number(order.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
        return {ok: false, reason: 'invalid quantity'};
    }
    if (typeof price !== 'number' || !(price > 0)) {
        return {ok: false, reason: 'no price'};
    }
    const total = qty * price;
    const positions = account.positions.map((position) => ({...position}));
    let cash = account.cash;
    let realizedPnl: number | undefined;
    const existing = positions.find((position) => position.symbol === order.symbol);

    if (order.side === 'buy') {
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
        if (!existing || existing.quantity < qty) {
            return {ok: false, reason: 'not held'};
        }
        realizedPnl = (price - existing.avgCost) * qty;
        existing.quantity -= qty;
        cash += total;
    }

    return {
        ok: true,
        account: {cash, positions: positions.filter((position) => position.quantity > 0)},
        ...(realizedPnl !== undefined ? {realizedPnl} : {}),
        total,
    };
};
