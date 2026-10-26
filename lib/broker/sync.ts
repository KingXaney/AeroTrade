// One sync of the Alpaca mirror (server-only by use): the source account's weights, Alpaca's
// clock, account, positions and assets, the plan (lib/broker/plan), and — only while Alpaca says
// the market is open and the account may trade — the orders, sells first, each with its day's
// client id so a retry the same day cannot double one. Anything that cannot run is a 'skipped'
// sync with its reason; a closed market or a blocked account is a preview. Never throws.

import {alpacaKeys, alpacaSettings} from "@/lib/broker/config";
import {createAlpacaClient, isDuplicateOrder} from "@/lib/broker/alpaca";
import {clientOrderId, planMirror, targetWeights, type MirrorAsset, type MirrorSkip} from "@/lib/broker/plan";
import type {BrokerSyncOrderDoc} from "@/database/models/broker-link.model";
import {BROKER_COPY} from "@/lib/learn/copy/broker";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {getPortfolio} from "@/lib/trading/valuation";

export type SyncOutcome = {
    kind: 'executed' | 'preview' | 'skipped';
    summary: string;
    orders: BrokerSyncOrderDoc[];
    skipped: MirrorSkip[];
};

const skippedSync = (note: string): SyncOutcome => ({kind: 'skipped', summary: BROKER_COPY.summary({kind: 'skipped', note}), orders: [], skipped: []});

export const syncBrokerLink = async (
    link: {id: string; userId: string; sourceAccountId: string},
    {execute, day}: {execute: boolean; day: string},
): Promise<SyncOutcome> => {
    try {
        const settings = alpacaSettings();
        if (settings.blocked || !settings.baseUrl) return skippedSync(settings.blocked === 'live-locked' ? BROKER_COPY.noteLiveLocked : BROKER_COPY.noteNoKeys);
        if (!(await getOwnedAccount(link.userId, link.sourceAccountId))) return skippedSync(BROKER_COPY.noteSourceMissing);

        const client = createAlpacaClient({baseUrl: settings.baseUrl, ...alpacaKeys()});
        const [clock, account, positions, source] = await Promise.all([client.clock(), client.account(), client.positions(), getPortfolio(link.userId, link.sourceAccountId)]);
        if (!clock.ok) return skippedSync(BROKER_COPY.unreachable(clock.message));
        if (!account.ok) return skippedSync(BROKER_COPY.unreachable(account.message));
        if (!positions.ok) return skippedSync(BROKER_COPY.unreachable(positions.message));

        const targets = targetWeights(source);
        // An asset is read for every symbol the source holds; an exit sells what Alpaca holds and
        // needs none.
        const assets = new Map<string, MirrorAsset>();
        for (const symbol of targets.keys()) {
            const asset = await client.asset(symbol);
            if (asset.ok) assets.set(symbol, {tradable: asset.data.tradable, fractionable: asset.data.fractionable});
        }
        const prices = new Map<string, number>();
        for (const position of source.positions) if (typeof position.currentPrice === 'number') prices.set(position.symbol.toUpperCase(), position.currentPrice);
        for (const position of positions.data) prices.set(position.symbol.toUpperCase(), position.price);

        const plan = planMirror({
            targets, equity: account.data.equity, cash: account.data.cash,
            positions: positions.data.map((p) => ({symbol: p.symbol.toUpperCase(), qty: p.qty, price: p.price, marketValue: p.marketValue})),
            assets, prices,
        });

        const live = execute && clock.data.isOpen && account.data.status === 'ACTIVE' && !account.data.tradingBlocked;
        const orders: BrokerSyncOrderDoc[] = [];
        for (const order of plan.orders) {
            const id = clientOrderId(link.id, day, order.side, order.symbol);
            const base = {symbol: order.symbol, side: order.side, reason: order.reason, clientOrderId: id,
                ...(order.notional !== undefined ? {notional: order.notional} : {}), ...(order.qty !== undefined ? {qty: order.qty} : {})};
            if (!live) {
                orders.push({...base, sent: false, ok: false});
                continue;
            }
            const placed = await client.submitOrder({symbol: order.symbol, side: order.side, notional: order.notional, qty: order.qty, clientOrderId: id});
            if (placed.ok) orders.push({...base, sent: true, ok: true, status: placed.data.status});
            else if (isDuplicateOrder(placed)) orders.push({...base, sent: true, ok: true, status: BROKER_COPY.alreadySent});
            else orders.push({...base, sent: true, ok: false, error: placed.message});
        }

        const note = !execute ? undefined
            : !clock.data.isOpen ? BROKER_COPY.noteClosed
                : account.data.status !== 'ACTIVE' || account.data.tradingBlocked ? BROKER_COPY.noteBlocked(account.data.status) : undefined;
        const kind = live ? 'executed' as const : 'preview' as const;
        const summary = BROKER_COPY.summary({
            kind, note,
            planned: plan.orders.length,
            sent: orders.filter((o) => o.sent && o.ok).length,
            failed: orders.filter((o) => o.sent && !o.ok).length,
            skipped: plan.skipped.length,
        });
        return {kind, summary, orders, skipped: plan.skipped};
    } catch (error) {
        console.error('Broker sync failed:', error);
        return skippedSync(BROKER_COPY.unreachable(error instanceof Error ? error.message : String(error)));
    }
};
