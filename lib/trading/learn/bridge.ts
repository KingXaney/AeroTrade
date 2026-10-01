// The return bridge: an account's total return split into what moved it. Pure — the
// /portfolio page feeds it the same summary the Total Return tile prints, plus the realized
// P&L and income it already reads, and the lines add up to that tile to the cent.
//
// The identity is exact, not approximate. executeOrder carries cost basis the average-cost
// way: a buy adds its total to basis, a sell removes shares × average cost and records
// (price − average cost) × shares as realizedPnl. So
//     net worth − starting balance = realized + unrealized + interest + dividends
// for every account whose sells all recorded a result. Anything else — a sell stored before
// realizedPnl existed — lands in a residual line rather than being spread over the others.

export type BridgeLineKey = 'price' | 'realized' | 'interest' | 'dividends' | 'residual';

type BridgeLine = {key: BridgeLineKey; amount: number; cents: number};

export type ReturnBridge = {
    total: number;
    totalCents: number;
    lines: BridgeLine[];
    income: number;
    // Interest + dividends as a % of the total return, when the return is a gain and income
    // is not zero; above 100 when trading lost part of what income added.
    incomeShare: number | null;
    // Holdings with no live quote: their price move is valued at cost, so counts as zero.
    unpriced: number;
    holdings: number;
};

export type BridgeInput = {
    totalReturn: number;
    positions: readonly {unrealizedPnl: number; priceStale: boolean}[];
    realizedPnl: number;
    income: {interest: number; dividends: number} | null | undefined;
    tradeCount: number;
};

// Half a cent: a residual smaller than this is floating-point noise, not a missing sell.
const RESIDUAL_MIN = 0.005;

// Cents the way the Total Return tile prints them: formatPrice rounds through Intl, which
// rounds the shortest decimal (1.005 → 1.01) where Math.round(x × 100) would not.
const CENTS = new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});
export const toCents = (amount: number): number => Math.round(Number(CENTS.format(amount)) * 100) + 0;

// Whole cents for each line that sum to the rounded total exactly: floor every line, then
// hand the cents still missing (or take the extra ones back) by largest remainder.
const allocateCents = (amounts: readonly number[], totalCents: number): number[] => {
    const scaled = amounts.map((amount) => amount * 100);
    const cents = scaled.map(Math.floor);
    let gap = totalCents - cents.reduce((sum, c) => sum + c, 0);
    const byRemainder = scaled.map((value, i) => ({i, remainder: value - Math.floor(value)}));
    const up = [...byRemainder].sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    const down = [...byRemainder].sort((a, b) => a.remainder - b.remainder || a.i - b.i);
    for (let k = 0; gap > 0; k += 1, gap -= 1) cents[up[k % up.length].i] += 1;
    for (let k = 0; gap < 0; k += 1, gap += 1) cents[down[k % down.length].i] -= 1;
    return cents;
};

// Null until there is something to split: no trade has filled and nothing has been credited.
export const buildReturnBridge = ({totalReturn, positions, realizedPnl, income, tradeCount}: BridgeInput): ReturnBridge | null => {
    const interest = income?.interest ?? 0;
    const dividends = income?.dividends ?? 0;
    const earned = interest + dividends;
    if (tradeCount <= 0 && !(earned > 0)) return null;

    const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const parts: {key: BridgeLineKey; amount: number}[] = [
        {key: 'price', amount: unrealized},
        {key: 'realized', amount: realizedPnl},
        {key: 'interest', amount: interest},
        {key: 'dividends', amount: dividends},
    ];
    const residual = totalReturn - parts.reduce((sum, part) => sum + part.amount, 0);
    if (Math.abs(residual) >= RESIDUAL_MIN) parts.push({key: 'residual', amount: residual});

    const totalCents = toCents(totalReturn);
    const cents = allocateCents(parts.map((part) => part.amount), totalCents);
    return {
        total: totalReturn,
        totalCents,
        lines: parts.map((part, i) => ({...part, cents: cents[i]})),
        income: earned,
        incomeShare: earned > 0 && totalReturn > 0 ? (earned / totalReturn) * 100 : null,
        unpriced: positions.filter((p) => p.priceStale).length,
        holdings: positions.length,
    };
};
