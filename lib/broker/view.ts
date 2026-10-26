// The Broker section's view (pure): the connection as the environment allows it, the owner's
// accounts with who trades each (the brains' first — the accounts a mirror is for), the link, the
// two accounts' weights side by side, and the syncs. The account number reaches the page as its
// last four characters only.

import type {AlpacaAccount, AlpacaOrder, AlpacaPosition} from "@/lib/broker/alpaca";
import type {AlpacaSettings} from "@/lib/broker/config";
import type {BrokerLinkView, BrokerSyncRecord} from "@/lib/broker/store";
import {CULTURE_PROFILES} from "@/lib/culture/config";
import {getEasternDateString} from "@/lib/dates";
import type {TradedBy} from "@/lib/trading/traded-by";

export type BrokerViewInput = {
    settings: AlpacaSettings;
    link: BrokerLinkView | null;
    accounts: {id: string; name: string; tradedBy: TradedBy}[];
    alpaca: {ok: true; account: AlpacaAccount; positions: AlpacaPosition[]; orders: AlpacaOrder[]} | {ok: false; message: string} | null;
    // The linked account's weights (lib/broker/plan.targetWeights), when one is linked.
    sourceWeights: ReadonlyMap<string, number> | null;
};

export type BrokerConnection =
    | {state: 'no-keys' | 'live-locked'; mode: 'paper' | 'live'}
    | {state: 'unreachable'; mode: 'paper' | 'live'; message: string}
    | {state: 'connected'; mode: 'paper' | 'live'; last4: string; status: string; equity: number; cash: number; buyingPower: number};

export type BrokerView = {
    connection: BrokerConnection;
    accounts: {id: string; name: string; tradedBy: string | null}[];
    link: {sourceAccountId: string; sourceName: string | null; since: string; status: 'active' | 'paused'} | null;
    comparison: {symbol: string; paper: number; alpaca: number}[];
    syncs: BrokerSyncRecord[];
    orders: AlpacaOrder[];
};

const whoTrades = (tradedBy: TradedBy): string | null =>
    tradedBy === null ? null : tradedBy.kind === 'navigator' ? 'the AI Navigator' : `the ${CULTURE_PROFILES[tradedBy.profile].label} culture picker`;

export const shapeBrokerView = ({settings, link, accounts, alpaca, sourceWeights}: BrokerViewInput): BrokerView => {
    const connection: BrokerConnection = settings.blocked
        ? {state: settings.blocked, mode: settings.mode}
        : alpaca === null || !alpaca.ok
            ? {state: 'unreachable', mode: settings.mode, message: alpaca && !alpaca.ok ? alpaca.message : 'not read'}
            : {state: 'connected', mode: settings.mode, last4: alpaca.account.accountNumber.slice(-4), status: alpaca.account.status,
                equity: alpaca.account.equity, cash: alpaca.account.cash, buyingPower: alpaca.account.buyingPower};

    const listed = accounts.map((a) => ({id: a.id, name: a.name, tradedBy: whoTrades(a.tradedBy)}));
    const ordered = [...listed.filter((a) => a.tradedBy !== null), ...listed.filter((a) => a.tradedBy === null)];

    const alpacaWeights = new Map<string, number>();
    if (alpaca?.ok && alpaca.account.equity > 0) {
        for (const position of alpaca.positions) alpacaWeights.set(position.symbol.toUpperCase(), position.marketValue / alpaca.account.equity);
    }
    const comparison = sourceWeights
        ? [...new Set([...sourceWeights.keys(), ...alpacaWeights.keys()])].map((symbol) => ({symbol, paper: sourceWeights.get(symbol) ?? 0, alpaca: alpacaWeights.get(symbol) ?? 0}))
        : [];

    return {
        connection,
        accounts: ordered,
        link: link && {
            sourceAccountId: link.sourceAccountId,
            sourceName: accounts.find((a) => a.id === link.sourceAccountId)?.name ?? null,
            since: getEasternDateString(new Date(link.createdAt)),
            status: link.status,
        },
        comparison,
        syncs: link?.syncs ?? [],
        orders: alpaca?.ok ? alpaca.orders : [],
    };
};
