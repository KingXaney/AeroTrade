// The order ticket's consequence line: what the order does to the account, in
// numbers, with no verb of advice. Every sentence here is held to the no-advice list
// by lib/learn/__tests__/trade-copy.test.ts.

import type {CashYield, OrderEffect} from "@/lib/trading/order-math";

const money = (n: number): string => `$${Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
const signedMoney = (n: number): string => `${n < 0 ? '−' : '+'}${money(n)}`;
const pct = (fraction: number): string => `${(fraction * 100).toFixed(fraction * 100 < 10 ? 1 : 0)}%`;
// Under $10 whole dollars would round a real figure to nothing.
const smallMoney = (n: number): string => (Math.abs(n) < 10 ? `$${Math.abs(n).toFixed(2)}` : money(n));
const apyPct = (apy: number): string => `${(apy * 100).toFixed(2)}%`;

// "earning ≈$300/month at 3.92% APY": the cash left, credited daily for CASH_YIELD_DAYS.
const cashYieldClause = (y: CashYield): string => `earning ≈${smallMoney(y.amount)}/month at ${apyPct(y.apy)} APY`;

// Buy: "1.5% of the account · largest position after: AAPL 22% · cash left $41,200 (41%) · earning ≈$135/month at 3.92% APY"
// Sell: "5 of 10 shares · 5 left · est. realized +$100 vs avg cost $180"
// `compact` keeps the first two facts for the 360px dashboard ticket; the interest clause
// describes the cash left, so it goes wherever that goes. No rate, no clause.
export const orderEffectLine = (effect: OrderEffect, compact = false): string => {
    if (effect.side === 'buy') {
        const parts = [`${pct(effect.shareOfAccount)} of the account`];
        if (effect.largestAfter) parts.push(`largest position after: ${effect.largestAfter.symbol} ${pct(effect.largestAfter.weight)}`);
        if (!compact) {
            parts.push(`cash left ${money(effect.cashAfter)} (${pct(effect.cashAfterWeight)})`);
            if (effect.cashYield) parts.push(cashYieldClause(effect.cashYield));
        }
        return parts.join(' · ');
    }
    const parts = [`${effect.quantity} of ${effect.owned} shares`, `${effect.sharesAfter} left`];
    if (!compact && effect.estRealizedPnl !== null && effect.avgCost !== null) {
        parts.push(`est. realized ${signedMoney(effect.estRealizedPnl)} vs avg cost $${effect.avgCost.toFixed(2)}`);
    }
    return parts.join(' · ');
};

// Paper orders fill at once at the last quote; the line says what would happen for real.
export const queueLine = (nextOpenLabel: string): string =>
    `Paper fills now at the last close · a real broker would queue this to ${nextOpenLabel}`;
