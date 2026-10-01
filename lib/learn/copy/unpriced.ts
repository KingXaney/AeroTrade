// How much of a valuation stands at cost — a holding with no live quote is valued at what was
// paid for it. The one builder, in the two lengths the app prints it:
//   'atCost'  the words beside a figure: "valued at cost" when every holding is unpriced, else
//             "2 of 5 valued at cost" (the return bridge's price line, the /portfolio header)
//   'marker'  the flag on a ranked return: "unpriced" / "partly unpriced" (analytics.unpricedLabel —
//             the account switcher, the comparison table, the friends leaderboard)
// Null when every holding is priced, or there are none. Import-free; the test holds every form to
// the 'copy' tier of lib/learn/banned.ts.

export type UnpricedForm = 'atCost' | 'marker';

// The tooltip on an unpriced holding's empty price cell.
export const UNPRICED_CELL_TITLE = 'No live quote — value shown at cost';

export const unpricedText = (unpriced: number, holdings: number, form: UnpricedForm = 'atCost'): string | null => {
    if (unpriced <= 0 || holdings <= 0) return null;
    const all = unpriced >= holdings;
    if (form === 'marker') return all ? 'unpriced' : 'partly unpriced';
    return all ? 'valued at cost' : `${unpriced} of ${holdings} valued at cost`;
};
