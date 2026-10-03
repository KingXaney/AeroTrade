'use client';

import {useState, useTransition} from "react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {recordGameRound, type RoundActionResult} from "@/lib/actions/games.actions";
import {
    DICE,
    MARKET_START,
    ROUNDS,
    dealFor,
    fairValue,
    isValidQuote,
    playRound,
    pnlByKind,
    revealedBefore,
    settlement,
    type Deal,
    type MarketState,
    type Quote,
} from "@/lib/games/market-making";
import {ARITHMETIC_COPY, MARKET_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import StatTile from "@/components/primitives/StatTile";
import TextField from "@/components/primitives/TextField";
import Sparkline from "@/components/games/Sparkline";

type Summary = {record: number | null; recent: number[]};
type Saved = Extract<RoundActionResult, {success: true}> | {success: false; message: string} | null;
type Game = {seed: number; deal: Deal; market: MarketState; quotes: Quote[]; startedAt: number};

const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

// The market-making game. The dice and every trader's belief come from the game's seed
// (lib/games/market-making.ts); the page sends the seed and the quotes when the game ends, and the
// server replays them to find the profit and loss.
const MarketMakingGame = ({summary}: {summary: Summary}) => {
    const [game, setGame] = useState<Game | null>(null);
    const [bid, setBid] = useState('13');
    const [ask, setAsk] = useState('15');
    const [saved, setSaved] = useState<Saved>(null);
    const [saving, startSaving] = useTransition();

    const start = () => {
        const seed = freshSeed();
        setSaved(null);
        setBid('13');
        setAsk('15');
        setGame({seed, deal: dealFor(seed), market: MARKET_START, quotes: [], startedAt: Date.now()});
    };

    const quote = () => {
        if (!game || game.market.done) return;
        const q = {bid: Number(bid), ask: Number(ask)};
        if (!isValidQuote(q)) {
            toast.error(MARKET_COPY.invalid);
            return;
        }
        const market = playRound(game.market, game.deal, q);
        const next = {...game, market, quotes: [...game.quotes, q]};
        setGame(next);
        if (market.done) {
            startSaving(async () => {
                const report = {game: 'market-making', seed: next.seed, quotes: next.quotes, durationMs: Date.now() - next.startedAt};
                setSaved(await recordGameRound(report).catch((): Saved => ({success: false, message: UNREACHABLE_MESSAGE})));
            });
        }
    };

    const recent = saved?.success ? saved.recent : summary.recent;
    const record = saved?.success ? saved.record : summary.record;

    if (!game) {
        return (
            <div className="space-y-5" data-market-lobby>
                <ul className="space-y-1.5 text-sm leading-relaxed text-fg-soft">
                    {MARKET_COPY.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <ActionButton size="md" onClick={start} data-market-start>{MARKET_COPY.start}</ActionButton>
                    {record !== null && <span className="font-mono text-xs text-fg-muted" data-lobby-record={record}>{MARKET_COPY.recordLabel}: {record}</span>}
                    {recent.length > 1 && <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>}
                </div>
            </div>
        );
    }

    const {market, deal} = game;
    const shown = revealedBefore(deal.dice, market.round);
    const lastRound = market.round - 1;
    const lastTrades = market.trades.filter((t) => t.round === lastRound);
    const sum = deal.dice.reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-5" data-market-game data-market-round={market.round}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <MicroLabel as="p" className="mb-1">{MARKET_COPY.shown}</MicroLabel>
                    <p className="flex items-center gap-2 text-4xl leading-none text-fg" data-market-dice={shown.join(',')}>
                        {Array.from({length: DICE}, (_, i) => (i < (market.done ? DICE : shown.length)
                            ? <span key={i} aria-label={String(deal.dice[i])}>{DIE_FACES[deal.dice[i] - 1]}</span>
                            : <span key={i} className="text-fg-muted/40" aria-label={MARKET_COPY.hiddenDie}>▢</span>))}
                    </p>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <StatTile label={MARKET_COPY.positionLabel} value={MARKET_COPY.signed(market.position)}/>
                    {!market.done && <StatTile label={MARKET_COPY.fairValueLabel} value={String(fairValue(deal.dice, market.round))} hint={MARKET_COPY.roundOf(Math.min(market.round + 1, ROUNDS))}/>}
                </div>
            </div>

            {lastRound >= 0 && (
                <ul className="space-y-1 text-sm" aria-live="polite" data-market-trades={lastTrades.length}>
                    {lastTrades.length === 0 ? <li className="text-fg-muted">{MARKET_COPY.noTrades}</li> : lastTrades.map((t) => (
                        <li key={`${t.round}-${t.trader}`} className={cn(t.side === 'bought' ? 'text-fg' : 'text-fg-soft')}>
                            {t.side === 'bought' ? MARKET_COPY.traderBought(t.trader + 1, t.price) : MARKET_COPY.traderSold(t.trader + 1, t.price)}
                        </li>
                    ))}
                </ul>
            )}

            {!market.done ? (
                <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); quote(); }} data-market-form>
                    <label className="space-y-1 text-xs text-fg-soft">
                        <span className="block">{MARKET_COPY.bid}</span>
                        <TextField inputMode="numeric" value={bid} onChange={(event) => setBid(event.target.value)} className="w-20" data-market-bid/>
                    </label>
                    <label className="space-y-1 text-xs text-fg-soft">
                        <span className="block">{MARKET_COPY.ask}</span>
                        <TextField inputMode="numeric" value={ask} onChange={(event) => setAsk(event.target.value)} className="w-20" data-market-ask/>
                    </label>
                    <ActionButton type="submit" size="md" data-market-quote>{MARKET_COPY.quote}</ActionButton>
                </form>
            ) : (
                <MarketSummary game={game} sum={sum} saved={saved} saving={saving} onAgain={start}/>
            )}
        </div>
    );
};

const MarketSummary = ({game, sum, saved, saving, onAgain}: {game: Game; sum: number; saved: Saved; saving: boolean; onAgain: () => void}) => {
    const pnl = settlement(game.market, game.deal);
    const split = pnlByKind(game.market, game.deal);
    return (
        <div className="space-y-4" data-market-summary data-market-pnl={pnl}>
            <p className="text-sm text-fg">{MARKET_COPY.settled(game.deal.dice, sum)}</p>
            <StatTile label={MARKET_COPY.pnlLabel} value={MARKET_COPY.signed(pnl)}
                      valueClass={cn('text-3xl', pnl > 0 ? 'text-positive' : pnl < 0 ? 'text-negative' : undefined)}/>
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-fg-soft" data-market-split>
                <span>{MARKET_COPY.fromInformed(split.informed)}</span>
                <span>{MARKET_COPY.fromNoise(split.noise)}</span>
            </div>
            <div>
                <MicroLabel as="p" className="mb-2">{MARKET_COPY.tradersHeading}</MicroLabel>
                <ol className="space-y-1.5">
                    {game.deal.beliefs.map((traders, round) => (
                        <RowCard as="li" key={round} className="px-3 py-2 text-xs">
                            <span className="mr-3 font-semibold text-fg">{MARKET_COPY.roundOf(round + 1)}</span>
                            {traders.map((t, i) => (
                                <span key={i} className={cn('mr-4 font-mono', t.kind === 'informed' ? 'text-brand' : 'text-fg-muted')}
                                      title={t.kind === 'informed' ? MARKET_COPY.informed : MARKET_COPY.noise} data-trader-kind={t.kind}>
                                    {i + 1}: {MARKET_COPY.believed(t.belief)}
                                </span>
                            ))}
                        </RowCard>
                    ))}
                </ol>
                <p className="mt-2 text-xs text-fg-muted"><span className="text-brand">■</span> {MARKET_COPY.informed} · {MARKET_COPY.noise}</p>
            </div>
            <p className="text-sm font-semibold" data-round-record={saved?.success ? String(saved.isRecord) : undefined}>
                {saving || !saved ? <span className="text-fg-muted">{ARITHMETIC_COPY.saving}</span>
                    : !saved.success ? <span className="text-warning">{saved.message}</span>
                        : saved.isRecord ? <span className="text-brand">{ARITHMETIC_COPY.newRecord}</span>
                            : <span className="text-fg-soft">{MARKET_COPY.recordLabel}: {saved.record ?? pnl}</span>}
            </p>
            <ActionButton size="md" onClick={onAgain} disabled={saving} data-market-again>{ARITHMETIC_COPY.playAgain}</ActionButton>
        </div>
    );
};

export default MarketMakingGame;
