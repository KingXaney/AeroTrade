// The rule for every catalog id. The engine looks its `decide` up here; the
// catalog itself never imports this module so client code can stay light.

import type {Decide, StrategyId} from '@/lib/strategies/types';
import {decide as buyAndHoldSpy} from '@/lib/strategies/rules/buy-and-hold-spy';
import {decide as sixtyForty} from '@/lib/strategies/rules/sixty-forty';
import {decide as goldenCross} from '@/lib/strategies/rules/golden-cross';
import {decide as dualMomentum} from '@/lib/strategies/rules/dual-momentum';
import {decide as momentum121} from '@/lib/strategies/rules/momentum-12-1';
import {decide as rsi2MeanReversion} from '@/lib/strategies/rules/rsi2-mean-reversion';
import {decide as donchianBreakout} from '@/lib/strategies/rules/donchian-breakout';
import {decide as lowVolatility} from '@/lib/strategies/rules/low-volatility';

export const STRATEGY_RULES: Record<StrategyId, Decide> = {
    'buy-and-hold-spy': buyAndHoldSpy,
    'sixty-forty': sixtyForty,
    'golden-cross': goldenCross,
    'dual-momentum': dualMomentum,
    'momentum-12-1': momentum121,
    'rsi2-mean-reversion': rsi2MeanReversion,
    'donchian-breakout': donchianBreakout,
    'low-volatility': lowVolatility,
};
