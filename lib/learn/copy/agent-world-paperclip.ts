// Every sentence the trading agent world writes into its Paperclip company: the session issue's
// title and description and the comments the Execution desk leaves on it. Paperclip shows them to
// whoever opens the board, so they are held to the 'copy' tier of lib/learn/banned like any page
// (lib/learn/__tests__/agent-world-paperclip-copy.test.ts): they say what the desk did with its own
// paper account, never what anyone else might do. A side of an order is a past-tense verb inside a
// sentence ("the paper account bought …"), never the word that opens one.

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const PAPERCLIP_COPY = {
    // "AAPL, MSFT and NVDA".
    list: (items: readonly string[]): string =>
        items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`,
    symbols: (n: number): string => count(n, 'symbol', 'symbols'),

    weeklyTitle: (weekKey: string, n: number): string => `Week of ${weekKey}: ${count(n, 'symbol', 'symbols')}`,
    manualTitle: (day: string, n: number): string => `Manual session ${day}: ${count(n, 'symbol', 'symbols')}`,
    previewTitle: (day: string, n: number): string => `Preview session ${day}: ${count(n, 'symbol', 'symbols')}`,

    descriptionLead: (sessionId: string, symbols: string): string =>
        `Session ${sessionId} rates ${symbols}, one run of the twelve-role desk for each, for the desk's shared paper account.`,
    descriptionOwner:
        "The orders the ratings lead to wait for the owner's decision on AeroTrade; the Execution desk records that decision on this issue.",
    descriptionAuto: 'The orders the ratings lead to are placed without a pause; this issue keeps the record.',
    descriptionCosts: 'Each role reports its own model cost to this company, so its budget shows what the session spent.',
    descriptionCaveat: "Every rating and order here is the desk's own paper trade: a record of what it did, not advice.",

    approvedBy: (by: string): string => `Approved by ${by} on AeroTrade.`,
    approvedAuto: 'Approved on AeroTrade without a pause, as the approval mode is auto.',
    declinedBy: (by: string): string => `Declined by ${by} on AeroTrade, so nothing was traded.`,
    declinedUnnamed: 'Declined on AeroTrade, so nothing was traded.',

    // "bought 10 AAPL at $150.00", mid-sentence.
    fillLine: (sold: boolean, quantity: number, symbol: string, price: string | null): string =>
        `${sold ? 'sold' : 'bought'} ${quantity.toLocaleString('en-US')} ${symbol}${price ? ` at ${price}` : ''}`,
    filled: (lines: string): string => `The paper account ${lines}.`,
    // "NVDA, 3 shares to buy (no live price)", mid-sentence.
    missedLine: (symbol: string, sold: boolean, quantity: number, why: string | null): string =>
        `${symbol}, ${count(quantity, 'share', 'shares')} to ${sold ? 'sell' : 'buy'}${why ? ` (${why})` : ''}`,
    missed: (n: number, lines: string): string => `${count(n, 'order', 'orders')} did not fill: ${lines}.`,
    noFills: 'No order reached the paper account.',

    blocked: (message: string): string => `The session stopped before any order was decided (${message}), so nothing was traded.`,
    blockedUnexplained: 'The session stopped before any order was decided, so nothing was traded.',
    lapsed: 'The session lapsed with no decision, so nothing was traded.',
    noOrders: 'Every rating kept the book as it is, so there was no order to decide on.',
} as const;
