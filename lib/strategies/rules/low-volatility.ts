// Low Volatility Top 10: monthly re-rank of the large caps by 63-day realised
// volatility, calmest first.

import {closesOf, realizedVol} from '@/lib/strategies/indicators';
import type {Decide} from '@/lib/strategies/types';
import {decideRanked, fmtPctUnsigned, fmtRank, readParam} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const window = readParam(def, 'volWindow');
    return decideRanked(def, ctx, {
        score: (bars) => realizedVol(closesOf(bars), window),
        direction: 'asc',
        needsNote: `needs ${window + 1} bars`,
        values: (close, vol63, position) => ({close, vol63, rank: position}),
        selectReason: (score, position, total, held) =>
            `${held ? 'hold' : 'monthly'}: ${window}-day realised vol ${fmtPctUnsigned(score)} ranks ${fmtRank(position, total)} lowest`,
        exitReason: (score, position, total) =>
            `exit: vol rank fell to ${fmtRank(position, total)} (${fmtPctUnsigned(score)})`,
    });
};
