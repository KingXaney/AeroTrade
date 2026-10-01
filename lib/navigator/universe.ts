// Which symbols the weekly run scores, and which of them may become targets.
// Pure, so the rule is unit-tested. Targets come only from the always-eligible
// ETFs and the brain's top verified tickers: the suggestion set is global, so a
// symbol must not enter it because one enrolled user happens to hold it. Each
// Navigator account's own holdings are scored as well — a held name needs this
// week's score for its exit trigger — but never from the owner's other accounts.

import {buildTargets, type TargetWeight} from "@/lib/navigator/allocator";
import {ALWAYS_ELIGIBLE_SYMBOLS} from "@/lib/navigator/config";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

// Arrays, not Sets: the universe crosses an Inngest step boundary as JSON.
export type NavigatorUniverse = {symbols: string[]; targetable: string[]};

export const selectNavigatorUniverse = (input: {
    navigators: {userId: string; accountId: string}[];
    accounts: {id: string; userId: string; symbols: string[]}[];
    topTickers: string[];
}): NavigatorUniverse => {
    // An account counts only under the user enrolled with it.
    const ownerByAccount = new Map(input.navigators.map((n) => [n.accountId, n.userId]));
    const held = input.accounts
        .filter((a) => ownerByAccount.get(a.id) === a.userId)
        .flatMap((a) => a.symbols.map((s) => s.toUpperCase()));
    const targetable = Array.from(new Set([...ALWAYS_ELIGIBLE_SYMBOLS, ...input.topTickers]));
    return {targetable, symbols: Array.from(new Set([...targetable, ...held]))};
};

// The week's targets: scored over the whole universe, picked from the targetable
// part only. A held-only name stays put until an exit trigger fires.
export const navigatorTargets = (scored: ScoredSymbol[], universe: NavigatorUniverse): TargetWeight[] => {
    const targetable = new Set(universe.targetable);
    return buildTargets(scored.filter((s) => targetable.has(s.symbol)));
};
