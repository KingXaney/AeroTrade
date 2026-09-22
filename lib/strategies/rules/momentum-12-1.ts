// 12-1 Momentum Top 8: monthly re-rank of the large caps by the return from 252
// to 21 bars ago. The ranking is published every day; trades only on due days.

import {closesOf, laggedReturn} from '@/lib/strategies/indicators';
import type {Decide} from '@/lib/strategies/types';
import {decideRanked, fmtPct, fmtRank, readParam} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const lookback = readParam(def, 'lookback');
    const skip = readParam(def, 'skip');
    return decideRanked(def, ctx, {
        score: (bars) => laggedReturn(closesOf(bars), lookback, skip),
        direction: 'desc',
        needsNote: `needs ${lookback + 1} bars`,
        values: (close, momentum, position) => ({close, momentum, rank: position}),
        selectReason: (score, position, total, held) =>
            `${held ? 'hold' : 'monthly'}: ranked ${fmtRank(position, total)} by 12-1 return (${fmtPct(score)})`,
        exitReason: (score, position, total) => `exit: fell to ${fmtRank(position, total)} (${fmtPct(score)})`,
    });
};
