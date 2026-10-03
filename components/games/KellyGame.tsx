'use client';

import {useState, useTransition} from "react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {recordGameRound, type RoundActionResult} from "@/lib/actions/games.actions";
import {COMPARISONS, KELLY_START, MAX_FLIPS, fixedFractionPath, flipsFor, isValidBet, logGrowth, playFlip, type Bet, type KellyState, type Side} from "@/lib/games/kelly";
import {ARITHMETIC_COPY, KELLY_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import StatTile from "@/components/primitives/StatTile";
import TextField from "@/components/primitives/TextField";
import PathChart, {type PathSeries} from "@/components/games/PathChart";
import Sparkline from "@/components/games/Sparkline";

type Summary = {record: number | null; recent: number[]};
type Saved = Extract<RoundActionResult, {success: true}> | {success: false; message: string} | null;
type Game = {seed: number; flips: boolean[]; state: KellyState; bets: Bet[]; startedAt: number; stopped: boolean; last: {heads: boolean; won: boolean; cents: number} | null};

const PRESETS = [0.05, 0.1, 0.2, 0.5] as const;
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
const centsOf = (dollars: string): number => Math.round(Number(dollars) * 100);

// The fixed rules' colours, as literal token classes.
const STYLE: Record<(typeof COMPARISONS)[number]['id'], {stroke: string; swatch: string}> = {
    kelly: {stroke: 'stroke-positive', swatch: 'bg-positive'},
    'half-kelly': {stroke: 'stroke-warning', swatch: 'bg-warning'},
    'all-in': {stroke: 'stroke-negative', swatch: 'bg-negative'},
};

// The Kelly coin game. Each flip's outcome comes from the game's seed (lib/games/kelly.ts); the page
// sends the seed and the bets when the game ends, and the server replays them to find the score.
const KellyGame = ({summary}: {summary: Summary}) => {
    const [game, setGame] = useState<Game | null>(null);
    const [amount, setAmount] = useState('5.00');
    const [saved, setSaved] = useState<Saved>(null);
    const [saving, startSaving] = useTransition();

    const save = (final: Game) => startSaving(async () => {
        const report = {game: 'kelly', seed: final.seed, bets: final.bets, durationMs: Date.now() - final.startedAt};
        setSaved(await recordGameRound(report).catch((): Saved => ({success: false, message: UNREACHABLE_MESSAGE})));
    });

    const start = () => {
        const seed = freshSeed();
        setSaved(null);
        setAmount('5.00');
        setGame({seed, flips: flipsFor(seed), state: KELLY_START, bets: [], startedAt: Date.now(), stopped: false, last: null});
    };

    const place = (side: Side) => {
        if (!game || game.state.ended || game.stopped) return;
        const bet = {side, cents: centsOf(amount)};
        if (!isValidBet(game.state, bet)) {
            toast.error(KELLY_COPY.invalidBet);
            return;
        }
        const heads = game.flips[game.state.flips];
        const state = playFlip(game.state, bet, heads);
        const next: Game = {...game, state, bets: [...game.bets, bet], last: {heads, won: (side === 'heads') === heads, cents: bet.cents}};
        setGame(next);
        if (Math.round(Number(amount) * 100) > state.bankroll) setAmount((state.bankroll / 100).toFixed(2));
        if (state.ended) save(next);
    };

    const stop = () => {
        if (!game || game.state.ended || game.stopped || game.bets.length === 0) return;
        const next = {...game, stopped: true};
        setGame(next);
        save(next);
    };

    const recent = saved?.success ? saved.recent : summary.recent;
    const record = saved?.success ? saved.record : summary.record;

    if (!game) {
        return (
            <div className="space-y-5" data-kelly-lobby>
                <ul className="space-y-1.5 text-sm leading-relaxed text-fg-soft">
                    {KELLY_COPY.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <ActionButton size="md" onClick={start} data-kelly-start>{KELLY_COPY.start}</ActionButton>
                    {record !== null && <span className="font-mono text-xs text-fg-muted" data-lobby-record={record}>{KELLY_COPY.recordLabel}: {KELLY_COPY.money(record)}</span>}
                    {recent.length > 1 && <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>}
                </div>
            </div>
        );
    }

    const over = game.state.ended !== null || game.stopped;
    const flipsPlayed = game.state.flips;
    const series: PathSeries[] = [
        {id: 'you', values: game.state.path, stroke: 'stroke-fg', swatch: 'bg-fg', label: KELLY_COPY.bankroll},
        ...(over ? COMPARISONS.map((rule) => ({
            id: rule.id, values: fixedFractionPath(game.flips, rule.fraction, flipsPlayed), ...STYLE[rule.id], label: KELLY_COPY.ruleNames[rule.id],
        })) : []),
    ];

    return (
        <div className="space-y-5" data-kelly-game data-kelly-ended={over ? (game.state.ended ?? 'stopped') : undefined}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div data-kelly-bankroll={game.state.bankroll}>
                    <StatTile label={KELLY_COPY.bankroll} value={KELLY_COPY.money(game.state.bankroll)} valueClass="text-3xl"/>
                </div>
                <span className="font-mono text-sm text-fg-soft" data-kelly-flips={flipsPlayed}>{KELLY_COPY.flipOf(Math.min(flipsPlayed + (over ? 0 : 1), MAX_FLIPS))}</span>
            </div>
            {game.last && (
                <p role="status" aria-live="polite" className={cn('text-sm', game.last.won ? 'text-positive' : 'text-negative')} data-kelly-last={game.last.won ? 'won' : 'lost'}>
                    {KELLY_COPY.lastFlip(game.last.heads, game.last.won, game.last.cents)}
                </p>
            )}
            {!over && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-fg-soft" htmlFor="kelly-bet">{KELLY_COPY.betLabel}</label>
                        <TextField id="kelly-bet" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-28" data-kelly-amount/>
                        <MicroLabel as="span" className="ml-2">{KELLY_COPY.presets}</MicroLabel>
                        {PRESETS.map((fraction) => (
                            <ActionButton key={fraction} variant="secondary" size="xs" data-kelly-preset={fraction}
                                          onClick={() => setAmount((Math.max(1, Math.floor(game.state.bankroll * fraction)) / 100).toFixed(2))}>
                                {Math.round(fraction * 100)}%
                            </ActionButton>
                        ))}
                        <ActionButton variant="secondary" size="xs" data-kelly-preset="all" onClick={() => setAmount((game.state.bankroll / 100).toFixed(2))}>{KELLY_COPY.all}</ActionButton>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <ActionButton size="md" onClick={() => place('heads')} data-kelly-bet="heads">{KELLY_COPY.onHeads}</ActionButton>
                        <ActionButton size="md" variant="strong" onClick={() => place('tails')} data-kelly-bet="tails">{KELLY_COPY.onTails}</ActionButton>
                        <ActionButton variant="secondary" disabled={game.bets.length === 0} onClick={stop} data-kelly-stop>{KELLY_COPY.stop}</ActionButton>
                    </div>
                </div>
            )}
            <PathChart series={series} label={KELLY_COPY.pathLabel}/>
            {over && (
                <div className="space-y-4" data-kelly-summary>
                    <p className="text-sm text-fg">
                        {KELLY_COPY.ended[game.state.ended ?? 'stopped']} {KELLY_COPY.final(game.state.bankroll)}
                    </p>
                    <div>
                        <MicroLabel as="p" className="mb-1">{KELLY_COPY.comparisonHeading}</MicroLabel>
                        <p className="mb-2 text-xs text-fg-muted">{KELLY_COPY.comparisonLead}</p>
                        <ul className="space-y-1.5">
                            {COMPARISONS.map((rule) => {
                                const path = fixedFractionPath(game.flips, rule.fraction, flipsPlayed);
                                return (
                                    <RowCard as="li" key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-kelly-rule={rule.id}>
                                        <span className="text-fg">{KELLY_COPY.ruleNames[rule.id]}</span>
                                        <span className="font-mono text-xs text-fg-soft">{KELLY_COPY.money(path.at(-1) ?? 0)} · {KELLY_COPY.growth(logGrowth(rule.fraction))}</span>
                                    </RowCard>
                                );
                            })}
                        </ul>
                    </div>
                    <p className="text-sm font-semibold" data-round-record={saved?.success ? String(saved.isRecord) : undefined}>
                        {saving || !saved ? <span className="text-fg-muted">{ARITHMETIC_COPY.saving}</span>
                            : !saved.success ? <span className="text-warning">{saved.message}</span>
                                : saved.isRecord ? <span className="text-brand">{ARITHMETIC_COPY.newRecord}</span>
                                    : <span className="text-fg-soft">{KELLY_COPY.recordLabel}: {KELLY_COPY.money(saved.record ?? game.state.bankroll)}</span>}
                    </p>
                    <ActionButton size="md" onClick={start} disabled={saving} data-kelly-again>{ARITHMETIC_COPY.playAgain}</ActionButton>
                </div>
            )}
        </div>
    );
};

export default KellyGame;
