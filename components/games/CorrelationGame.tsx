'use client';

import {useState, useTransition} from "react";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {recordGameRound, type RoundActionResult} from "@/lib/actions/games.actions";
import {CLOSE, CORRELATION_ROUNDS, scattersFor, scoreGuesses, type Point, type Scatter} from "@/lib/games/correlation";
import {ARITHMETIC_COPY, CORRELATION_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import StatTile from "@/components/primitives/StatTile";
import Sparkline from "@/components/games/Sparkline";

type Summary = {record: number | null; recent: number[]};
type Saved = Extract<RoundActionResult, {success: true}> | {success: false; message: string} | null;
type Game = {seed: number; scatters: Scatter[]; index: number; guesses: number[]; revealed: boolean; startedAt: number; done: boolean};

const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
const SIZE = 280;
const SPAN = 3.2;

// Fifty points in a square, both axes from −3.2 to 3.2 standard deviations.
const ScatterPlot = ({points, label}: {points: readonly Point[]; label: string}) => {
    const at = (v: number) => ((Math.max(-SPAN, Math.min(SPAN, v)) + SPAN) / (2 * SPAN)) * SIZE;
    return (
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-72" role="img" aria-label={label} data-scatter={points.length}>
            <rect x={0} y={0} width={SIZE} height={SIZE} className="fill-none stroke-line-strong" strokeWidth={1}/>
            {points.map((p, i) => <circle key={i} cx={at(p.x)} cy={SIZE - at(p.y)} r={3.5} className="fill-brand"/>)}
        </svg>
    );
};

// Guess the correlation. The scatters come from the game's seed (lib/games/correlation.ts); the
// page sends the seed and the ten guesses, and the server replays them to find the score.
const CorrelationGame = ({summary}: {summary: Summary}) => {
    const [game, setGame] = useState<Game | null>(null);
    const [guess, setGuess] = useState(0);
    const [saved, setSaved] = useState<Saved>(null);
    const [saving, startSaving] = useTransition();

    const start = () => {
        const seed = freshSeed();
        setSaved(null);
        setGuess(0);
        setGame({seed, scatters: scattersFor(seed), index: 0, guesses: [], revealed: false, startedAt: Date.now(), done: false});
    };

    const reveal = () => {
        if (!game || game.revealed || game.done) return;
        setGame({...game, revealed: true, guesses: [...game.guesses, Math.round(guess * 100) / 100]});
    };

    const next = () => {
        if (!game || !game.revealed) return;
        if (game.index + 1 < CORRELATION_ROUNDS) {
            setGame({...game, index: game.index + 1, revealed: false});
            setGuess(0);
            return;
        }
        const final = {...game, done: true};
        setGame(final);
        startSaving(async () => {
            const report = {game: 'correlation', seed: final.seed, guesses: final.guesses, durationMs: Date.now() - final.startedAt};
            setSaved(await recordGameRound(report).catch((): Saved => ({success: false, message: UNREACHABLE_MESSAGE})));
        });
    };

    const recent = saved?.success ? saved.recent : summary.recent;
    const record = saved?.success ? saved.record : summary.record;

    if (!game) {
        return (
            <div className="space-y-5" data-correlation-lobby>
                <p className="text-sm leading-relaxed text-fg-soft">{CORRELATION_COPY.subtitle}</p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <ActionButton size="md" onClick={start} data-correlation-start>{CORRELATION_COPY.start}</ActionButton>
                    {record !== null && <span className="font-mono text-xs text-fg-muted" data-lobby-record={record}>{CORRELATION_COPY.record(record)}</span>}
                    {recent.length > 1 && <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>}
                </div>
            </div>
        );
    }

    const result = scoreGuesses(game.scatters, game.guesses);
    if (game.done) {
        return (
            <div className="space-y-4" data-correlation-summary data-correlation-score={result.score}>
                <StatTile label={CORRELATION_COPY.scoreLabel} value={(result.score / 1000).toFixed(3)} valueClass="text-3xl"/>
                <p className="font-mono text-xs text-fg-soft">{CORRELATION_COPY.closeCount(result.close)} · {CORRELATION_COPY.longestRun(result.longestRun)}</p>
                <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {game.scatters.map((scatter, i) => (
                        <RowCard as="li" key={i} className={cn('px-2 py-1.5 font-mono text-[11px]', result.errors[i] <= CLOSE ? 'text-positive' : 'text-fg-soft')}>
                            {i + 1}: {game.guesses[i].toFixed(2)} / {scatter.r.toFixed(2)}
                        </RowCard>
                    ))}
                </ol>
                <p className="text-sm font-semibold" data-round-record={saved?.success ? String(saved.isRecord) : undefined}>
                    {saving || !saved ? <span className="text-fg-muted">{ARITHMETIC_COPY.saving}</span>
                        : !saved.success ? <span className="text-warning">{saved.message}</span>
                            : saved.isRecord ? <span className="text-brand">{ARITHMETIC_COPY.newRecord}</span>
                                : <span className="text-fg-soft">{CORRELATION_COPY.record(saved.record ?? result.score)}</span>}
                </p>
                <ActionButton size="md" onClick={start} disabled={saving} data-correlation-again>{ARITHMETIC_COPY.playAgain}</ActionButton>
            </div>
        );
    }

    const scatter = game.scatters[game.index];
    const miss = game.revealed ? result.errors[game.index] : null;
    // The run of close guesses ending at this plot.
    let run = 0;
    for (let i = game.guesses.length - 1; i >= 0 && result.errors[i] <= CLOSE; i--) run++;

    return (
        <div className="space-y-4" data-correlation-game data-correlation-plot={game.index}>
            <div className="flex items-center justify-between font-mono text-sm text-fg-soft">
                <span>{CORRELATION_COPY.plotOf(game.index + 1)}</span>
                {run > 1 && <span className="text-positive" data-correlation-run={run}>{CORRELATION_COPY.run(run)}</span>}
            </div>
            <ScatterPlot points={scatter.points} label={CORRELATION_COPY.plotLabel(game.index + 1)}/>
            <label className="block space-y-2">
                <MicroLabel as="span" className="block">{CORRELATION_COPY.guessLabel}: <span className="font-mono text-sm text-fg" data-correlation-guess>{guess.toFixed(2)}</span></MicroLabel>
                <input type="range" min={-1} max={1} step={0.01} value={guess} disabled={game.revealed}
                       onChange={(event) => setGuess(Number(event.target.value))} className="w-full accent-brand" data-correlation-slider/>
            </label>
            {miss === null ? (
                <ActionButton size="md" onClick={reveal} data-correlation-reveal>{CORRELATION_COPY.guess}</ActionButton>
            ) : (
                <div className="flex flex-wrap items-center gap-4">
                    <p className={cn('font-mono text-sm', miss <= CLOSE ? 'text-positive' : 'text-fg-soft')} role="status" data-correlation-miss={miss.toFixed(2)}>
                        {CORRELATION_COPY.reveal(scatter.r, miss)}{miss <= CLOSE ? ` · ${CORRELATION_COPY.close}` : ''}
                    </p>
                    <ActionButton size="md" onClick={next} data-correlation-next>
                        {game.index + 1 < CORRELATION_ROUNDS ? CORRELATION_COPY.next : CORRELATION_COPY.finish}
                    </ActionButton>
                </div>
            )}
        </div>
    );
};

export default CorrelationGame;
