// The Alpaca trading API client (v2; paper and live share it — lib/broker/config picks the
// address). Server-only by use, never imported by a client file: the keys ride in the
// APCA-API-KEY-ID / APCA-API-SECRET-KEY headers. Every call answers, never throws: Alpaca's own
// message on a refusal, status 0 on a network failure, and a response that does not read as the
// documented shape is a refusal too (zod). A rate, auth or outage refusal is filed with the limits
// tracker; a 403 for buying power is an answer, not a limit.

import {z} from "zod";
import {reportLimit} from "@/lib/limits/report";

export type AlpacaResult<T> = {ok: true; data: T} | {ok: false; status: number; message: string};

export type AlpacaAccount = {accountNumber: string; status: string; currency: string; equity: number; cash: number; buyingPower: number; tradingBlocked: boolean};
export type AlpacaPosition = {symbol: string; qty: number; marketValue: number; price: number; avgEntryPrice: number};
export type AlpacaClock = {isOpen: boolean; nextOpen: string; nextClose: string};
export type AlpacaAsset = {symbol: string; tradable: boolean; fractionable: boolean};
export type AlpacaOrder = {
    id: string;
    clientOrderId: string;
    symbol: string;
    side: 'buy' | 'sell';
    status: string;
    qty: number | null;
    notional: number | null;
    filledQty: number;
    filledAvgPrice: number | null;
    submittedAt: string | null;
};
export type OrderRequest = {symbol: string; side: 'buy' | 'sell'; notional?: number; qty?: number; clientOrderId: string};

// Alpaca sends its figures as strings.
const num = z.union([z.string(), z.number()]).transform((value) => Number(value)).pipe(z.number().finite());
const numOrNull = z.union([z.string(), z.number(), z.null()]).transform((value) => (value === null ? null : Number(value))).pipe(z.number().finite().nullable());

const AccountSchema = z.object({
    account_number: z.string(), status: z.string(), currency: z.string(), equity: num, cash: num, buying_power: num, trading_blocked: z.boolean(),
}).transform((a): AlpacaAccount => ({accountNumber: a.account_number, status: a.status, currency: a.currency, equity: a.equity, cash: a.cash, buyingPower: a.buying_power, tradingBlocked: a.trading_blocked}));

const PositionSchema = z.object({symbol: z.string(), qty: num, market_value: num, current_price: num, avg_entry_price: num})
    .transform((p): AlpacaPosition => ({symbol: p.symbol, qty: p.qty, marketValue: p.market_value, price: p.current_price, avgEntryPrice: p.avg_entry_price}));

const ClockSchema = z.object({is_open: z.boolean(), next_open: z.string(), next_close: z.string()})
    .transform((c): AlpacaClock => ({isOpen: c.is_open, nextOpen: c.next_open, nextClose: c.next_close}));

const AssetSchema = z.object({symbol: z.string(), tradable: z.boolean(), fractionable: z.boolean()})
    .transform((a): AlpacaAsset => ({symbol: a.symbol, tradable: a.tradable, fractionable: a.fractionable}));

const OrderSchema = z.object({
    id: z.string(), client_order_id: z.string(), symbol: z.string(), side: z.enum(['buy', 'sell']), status: z.string(),
    qty: numOrNull.optional().default(null), notional: numOrNull.optional().default(null), filled_qty: num, filled_avg_price: numOrNull.optional().default(null),
    submitted_at: z.string().nullable().optional().default(null),
}).transform((o): AlpacaOrder => ({
    id: o.id, clientOrderId: o.client_order_id, symbol: o.symbol, side: o.side, status: o.status, qty: o.qty, notional: o.notional,
    filledQty: o.filled_qty, filledAvgPrice: o.filled_avg_price, submittedAt: o.submitted_at,
}));

const messageOf = (body: unknown, fallback: string): string => {
    const message = (body as {message?: unknown} | null)?.message;
    return typeof message === 'string' && message.length > 0 ? message.slice(0, 300) : fallback;
};

// Alpaca's refusal of a client_order_id it has already seen: the order was placed by an earlier try.
export const isDuplicateOrder = (result: AlpacaResult<unknown>): boolean =>
    !result.ok && result.status === 422 && /client_order_id/i.test(result.message);

// Dollars to the cent and whole or exact shares, as the strings Alpaca's examples send.
const amount = (value: number, decimals: number): string => String(Number(value.toFixed(decimals)));

export const createAlpacaClient = ({baseUrl, keyId, secret, fetchImpl = fetch}: {baseUrl: string; keyId: string; secret: string; fetchImpl?: typeof fetch}) => {
    const call = async <T>(path: string, schema: z.ZodType<T>, init: {method?: 'GET' | 'POST'; body?: unknown} = {}): Promise<AlpacaResult<T>> => {
        try {
            const response = await fetchImpl(`${baseUrl}${path}`, {
                method: init.method ?? 'GET',
                headers: {'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json', ...(init.body ? {'Content-Type': 'application/json'} : {})},
                ...(init.body ? {body: JSON.stringify(init.body)} : {}),
                cache: 'no-store',
            });
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                const message = messageOf(body, `HTTP ${response.status}`);
                await reportLimit('alpaca', {status: response.status, message: `${path}: HTTP ${response.status} ${message}`});
                return {ok: false, status: response.status, message};
            }
            const parsed = schema.safeParse(body);
            return parsed.success ? {ok: true, data: parsed.data} : {ok: false, status: response.status, message: `unexpected response from ${path}`};
        } catch (error) {
            return {ok: false, status: 0, message: error instanceof Error ? error.message : String(error)};
        }
    };
    return {
        account: () => call('/v2/account', AccountSchema),
        positions: () => call('/v2/positions', z.array(PositionSchema)),
        clock: () => call('/v2/clock', ClockSchema),
        asset: (symbol: string) => call(`/v2/assets/${encodeURIComponent(symbol)}`, AssetSchema),
        orders: (limit: number) => call(`/v2/orders?status=all&limit=${limit}&direction=desc`, z.array(OrderSchema)),
        submitOrder: (order: OrderRequest) => call('/v2/orders', OrderSchema, {
            method: 'POST',
            body: {
                symbol: order.symbol, side: order.side, type: 'market', time_in_force: 'day',
                ...(order.notional !== undefined ? {notional: amount(order.notional, 2)} : {qty: amount(order.qty ?? 0, 9)}),
                client_order_id: order.clientOrderId,
            },
        }),
    };
};

export type AlpacaClient = ReturnType<typeof createAlpacaClient>;
