// Copy for the stock page's "What the rules see" panel (lib/stocks/rules-see.ts builds the view):
// the row each rule-based strategy stored for this symbol on its latest board. The rows are
// the rules' own records, quoted; nothing here says what the reader might do with them. Each
// row's plain-words reading comes from lib/learn/copy/board.ts through readBoardRow. Held to
// the 'copy' tier of lib/learn/banned.ts by rules-see.test.ts.

const joinOr = (names: readonly string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;

export const RULES_SEE_COPY = {
    heading: 'What the rules see',
    intro: (symbol: string, count: number): string =>
        `${symbol} is on the signal board of ${count} rule-based ${count === 1 ? 'strategy; it records' : 'strategies; each records'} its reading of ${symbol} every trading morning it runs.`,
    // Printed once for the panel when every row shares it, else on each row.
    stamp: (asOf: string, date: string): string => `As of the ${asOf} close · decided for ${date}`,
    missing: (symbol: string, names: readonly string[]): string => `No stored board row for ${symbol} from ${joinOr(names)}.`,
    missingAll: (symbol: string): string =>
        `No stored board has a row for ${symbol} yet: a strategy records its board each trading morning it runs.`,
    // The panel's one disclosure: the rows read in plain words, then the definitions.
    readingLabel: (symbol: string): string => `Read these rows — ${symbol}`,
} as const;
