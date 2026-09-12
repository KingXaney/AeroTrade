// The order ticket's client-side arithmetic: what a preset means, and whether an
// order can obviously not fill. Pure on purpose so it is unit-tested; the server
// (executeOrder) re-checks everything with the live price and stays authoritative.

export type OrderSide = 'buy' | 'sell';

export type OrderInputs = {
    side: OrderSide;
    quantity: number;          // whatever the user typed, already coerced to a number
    price: number | null;      // last quote, or null when none is available
    cash: number;              // buying power in the active account
    owned: number;             // shares of this symbol held in the active account
};

export type OrderCheck = {
    ok: boolean;               // false only for a *definite* problem; an unknown price never blocks
    message: string | null;    // what to tell the user, when there is something to say
    estTotal: number | null;   // cost or proceeds at the last price, when there is one
};

export type Preset = {label: string; value: number};

const FRACTIONS: readonly [string, number][] = [['25%', 0.25], ['50%', 0.5], ['75%', 0.75]];

const money = (n: number): string => `$${n.toFixed(2)}`;

// Whole shares the user could buy at `price` with `cash`; null when it can't be known.
export const affordableShares = (cash: number, price: number | null): number | null => {
    if (typeof price !== 'number' || !(price > 0) || !(cash > 0)) return null;
    return Math.floor(cash / price);
};

// Quick-fill buttons. Sell presets are fractions of what is owned (as the sell dialog
// already does); buy presets are fractions of what the cash affords at the last price.
// Null when there is nothing to fill from — no position, no price, or under one share.
export const presetQuantities = (side: OrderSide, {cash, price, owned}: Pick<OrderInputs, 'cash' | 'price' | 'owned'>): Preset[] | null => {
    const max = side === 'sell' ? Math.floor(owned) : affordableShares(cash, price);
    if (max === null || max < 1) return null;
    return [
        ...FRACTIONS.map(([label, f]) => ({label, value: Math.max(1, Math.floor(max * f))})),
        {label: 'Max', value: max},
    ];
};

export const checkOrder = ({side, quantity, price, cash, owned}: OrderInputs): OrderCheck => {
    const qty = Math.floor(quantity);
    const hasPrice = typeof price === 'number' && price > 0;
    const estTotal = hasPrice && qty > 0 ? price * qty : null;

    if (!Number.isFinite(qty) || qty < 1) {
        return {ok: false, message: 'Enter a whole number of shares', estTotal: null};
    }
    if (side === 'sell') {
        if (owned < 1) return {ok: false, message: "You don't own any shares of this symbol in this account", estTotal};
        if (qty > owned) return {ok: false, message: `You only own ${owned} share${owned === 1 ? '' : 's'}`, estTotal};
        return {ok: true, message: null, estTotal};
    }
    // Buy. Without a price the cost is unknown; that is not a reason to block — the QA
    // harness runs with no quote provider at all, and the server rejects for real.
    if (estTotal !== null && estTotal > cash) {
        return {ok: false, message: `Not enough buying power — need ${money(estTotal)}, have ${money(cash)}`, estTotal};
    }
    return {ok: true, message: null, estTotal};
};
