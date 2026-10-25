// Settings › Broker's one read (server-only by use): the link, the owner's accounts with who
// trades each, Alpaca's account, positions and recent orders read live, and the linked account's
// weights — shaped by lib/broker/view. A refusal from Alpaca is part of the view, never a throw.

import {cache} from "react";
import {alpacaKeys, alpacaSettings} from "@/lib/broker/config";
import {createAlpacaClient} from "@/lib/broker/alpaca";
import {targetWeights} from "@/lib/broker/plan";
import {getBrokerLink} from "@/lib/broker/store";
import {shapeBrokerView, type BrokerView, type BrokerViewInput} from "@/lib/broker/view";
import {getAccountsForUser, getOwnedAccount} from "@/lib/trading/accounts";
import {tradedBy} from "@/lib/trading/traded-by";
import {getPortfolio} from "@/lib/trading/valuation";

const RECENT_ORDERS = 10;

const readAlpaca = async (): Promise<BrokerViewInput['alpaca']> => {
    const settings = alpacaSettings();
    if (settings.blocked || !settings.baseUrl) return null;
    const client = createAlpacaClient({baseUrl: settings.baseUrl, ...alpacaKeys()});
    const [account, positions, orders] = await Promise.all([client.account(), client.positions(), client.orders(RECENT_ORDERS)]);
    if (!account.ok) return {ok: false, message: account.message};
    return {ok: true, account: account.data, positions: positions.ok ? positions.data : [], orders: orders.ok ? orders.data : []};
};

export const getBrokerView = cache(async (userId: string): Promise<BrokerView> => {
    const [link, docs, alpaca] = await Promise.all([getBrokerLink(userId), getAccountsForUser(userId), readAlpaca()]);
    const accounts = await Promise.all(docs.map(async (doc) => ({
        id: String(doc._id), name: doc.name, tradedBy: await tradedBy(userId, String(doc._id)).catch(() => null),
    })));
    const sourceWeights = link && (await getOwnedAccount(userId, link.sourceAccountId))
        ? targetWeights(await getPortfolio(userId, link.sourceAccountId))
        : null;
    return shapeBrokerView({settings: alpacaSettings(), link, accounts, alpaca, sourceWeights});
});
