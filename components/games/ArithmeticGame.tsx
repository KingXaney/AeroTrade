'use client';

import {useEffect, useReducer, useRef, useState, useTransition} from "react";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {recordGameRound, type RoundActionResult} from "@/lib/actions/games.actions";
import {ArithmeticSettingsSchema, DURATIONS, OPERATIONS, ZETAMAC_DEFAULTS, problemText, type ArithmeticSettings, type Operation} from "@/lib/games/arithmetic";
import {LOBBY, roundReducer, roundReport, roundScore} from "@/lib/games/arithmetic-round";
import {INTERVIEW_QUESTIONS, OPTION_COUNT} from "@/lib/games/interview";
import {ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import StatTile from "@/components/primitives/StatTile";
import TextField, {fieldClass} from "@/components/primitives/TextField";
import Sparkline from "@/components/games/Sparkline";

export type ArithmeticMode = 'sprint' | 'custom' | 'interview';
type Summary = {record: number | null; recent: number[]};

type Props = {
    mode: ArithmeticMode;
    // The record and last rounds on this mode's settings; null for custom, which has none until played.
    summary: Summary | null;
};

type Saved = Extract<RoundActionResult, {success: true}> | {success: false; message: string} | null;

// A fresh seed per round, taken in the click that starts it (never during render).
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;

// Zetamac-style mental arithmetic, its custom mode, and the 80-in-8 interview mode. The round is
// the pure reducer in lib/games/arithmetic-round.ts; this component owns its clock, its keys and
// the report it sends when the round ends — the server keeps a round only if a person could have
// played it (lib/games/rounds.keptRound) and answers with the record.
const ArithmeticGame = ({mode, summary}: Props) => {
    const [round, dispatch] = useReducer(roundReducer, LOBBY);
    const [settings, setSettings] = useState<ArithmeticSettings>(ZETAMAC_DEFAULTS);
    const [invalid, setInvalid] = useState(false);
    const [saved, setSaved] = useState<Saved>(null);
    const [saving, startSaving] = useTransition();
    const savedFor = useRef<number | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const interview = mode === 'interview';
    const playing = round.kind !== 'lobby' && round.phase === 'playing';

    const start = () => {
        if (mode === 'custom' && !ArithmeticSettingsSchema.safeParse(settings).success) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        setSaved(null);
        const at = Date.now();
        dispatch(interview ? {type: 'start-interview', seed: freshSeed(), at} : {type: 'start-sprint', seed: freshSeed(), settings, at});
    };

    // The clock, five ticks a second while a round runs; the reducer ends the round at zero.
    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => dispatch({type: 'tick', at: Date.now()}), 200);
        return () => window.clearInterval(id);
    }, [playing]);

    // Keys 1–5 choose an option; a key held with ⌘, Ctrl or Alt is left alone (⌘K stays search).
    useEffect(() => {
        if (!playing || !interview) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const n = Number(event.key);
            if (Number.isInteger(n) && n >= 1 && n <= OPTION_COUNT) {
                event.preventDefault();
                dispatch({type: 'choose', option: n - 1, at: Date.now()});
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [playing, interview]);

    useEffect(() => {
        if (playing && !interview) input.current?.focus();
    }, [playing, interview]);

    // One report per round, sent when it ends.
    useEffect(() => {
        if (round.kind === 'lobby' || round.phase !== 'done' || savedFor.current === round.startedAt) return;
        savedFor.current = round.startedAt;
        const report = roundReport(round);
        startSaving(async () => {
            const result = await recordGameRound(report).catch((): Saved => ({success: false, message: UNREACHABLE_MESSAGE}));
            setSaved(result);
        });
    }, [round]);

    const recent = saved?.success ? saved.recent : summary?.recent ?? [];
    const record = saved?.success ? saved.record : summary?.record ?? null;

    if (round.kind !== 'lobby' && round.phase === 'playing') {
        const secondsLeft = (round.endsAt - round.now) / 1000;
        const score = roundScore(round);
        return (
            <div className="space-y-6" data-arithmetic-playing={mode}>
                <div className="flex items-center justify-between gap-4 font-mono text-sm">
                    <span role="timer" aria-live="off" className={cn(secondsLeft <= 10 ? 'text-warning' : 'text-fg-soft')} data-time-left>
                        {ARITHMETIC_COPY.timeLeft(secondsLeft)}
                    </span>
                    <span className="text-fg" data-round-score={score}>
                        {round.kind === 'interview' ? ARITHMETIC_COPY.questionOf(Math.min(round.index + 1, INTERVIEW_QUESTIONS), INTERVIEW_QUESTIONS) : ARITHMETIC_COPY.correct(score)}
                    </span>
                </div>
                {round.kind === 'interview' ? (
                    <div className="space-y-5" data-interview-question={round.index}>
                        <p className="text-center font-mono text-4xl font-semibold text-fg" data-question-text>{round.questions[round.index]?.text}</p>
                        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                            {round.questions[round.index]?.options.map((option, i) => (
                                <li key={`${round.index}-${option}`}>
                                    <button type="button" aria-keyshortcuts={String(i + 1)} data-option={i}
                                            onClick={() => dispatch({type: 'choose', option: i, at: Date.now()})}
                                            className="row-card flex w-full items-center gap-2 px-3 py-3 text-left font-mono text-base text-fg hover:border-brand/40">
                                        <span className="text-xs text-fg-muted">{i + 1}</span>{option}
                                    </button>
                                </li>
                            ))}
                        </ol>
                    </div>
                ) : (
                    <div className="space-y-4 text-center">
                        <p className="font-mono text-5xl font-semibold text-fg" data-problem-text>{problemText(round.problem)}</p>
                        <label className="sr-only" htmlFor="arithmetic-answer">{ARITHMETIC_COPY.answerLabel}</label>
                        <TextField
                            id="arithmetic-answer"
                            ref={input}
                            value={round.typed}
                            onChange={(event) => dispatch({type: 'type', value: event.target.value})}
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={10}
                            className="mx-auto block w-48 text-center text-2xl"
                            data-arithmetic-answer
                        />
                    </div>
                )}
                <div className="text-center">
                    <ActionButton variant="secondary" onClick={() => dispatch({type: 'stop', at: Date.now()})} data-round-stop>{ARITHMETIC_COPY.stop}</ActionButton>
                </div>
            </div>
        );
    }

    if (round.kind !== 'lobby') {
        const score = roundScore(round);
        const elapsed = Math.max(1, round.now - round.startedAt) / 1000;
        return (
            <div className="space-y-5" data-arithmetic-done={mode} data-round-final={score}>
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                    <StatTile label={ARITHMETIC_COPY.scoreHeading} value={score.toLocaleString('en-US')} valueClass="text-4xl"/>
                    {round.kind === 'interview' && <p className="font-mono text-sm text-fg-soft" data-round-wrong={round.wrong}>{ARITHMETIC_COPY.wrong(round.wrong)}</p>}
                    {score > 0 && <p className="font-mono text-sm text-fg-soft">{ARITHMETIC_COPY.perProblem(elapsed / score)}</p>}
                </div>
                {round.kind === 'sprint' && (
                    <ul className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-fg-muted" data-round-detail>
                        {round.settings.operations.map((op) => <li key={op}>{ARITHMETIC_COPY.operations[op]}: {round.counts[op]}</li>)}
                    </ul>
                )}
                <p className="text-sm font-semibold" data-round-record={saved?.success ? String(saved.isRecord) : undefined}>
                    {saving || !saved ? <span className="text-fg-muted">{ARITHMETIC_COPY.saving}</span>
                        : !saved.success ? <span className="text-warning">{saved.message}</span>
                            : saved.isRecord ? <span className="text-brand">{ARITHMETIC_COPY.newRecord}</span>
                                : <span className="text-fg-soft">{ARITHMETIC_COPY.record(saved.record ?? score)}</span>}
                </p>
                {recent.length > 1 && (
                    <div>
                        <MicroLabel as="p" className="mb-1">{ARITHMETIC_COPY.recentHeading}</MicroLabel>
                        <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>
                    </div>
                )}
                <ActionButton size="md" onClick={start} disabled={saving} data-round-again>{ARITHMETIC_COPY.playAgain}</ActionButton>
            </div>
        );
    }

    return (
        <div className="space-y-5" data-arithmetic-lobby={mode}>
            <p className="text-sm leading-relaxed text-fg-soft">
                {mode === 'sprint' ? ARITHMETIC_COPY.sprintLead : mode === 'custom' ? ARITHMETIC_COPY.customLead : ARITHMETIC_COPY.interviewLead}
            </p>
            {mode === 'custom' && <CustomSettings settings={settings} onChange={setSettings}/>}
            {invalid && <p className="text-sm text-warning" role="alert" data-custom-invalid>{ARITHMETIC_COPY.invalid}</p>}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <ActionButton size="md" onClick={start} data-round-start>{ARITHMETIC_COPY.start}</ActionButton>
                {record !== null && <span className="font-mono text-xs text-fg-muted" data-lobby-record={record}>{ARITHMETIC_COPY.record(record)}</span>}
                {recent.length > 1 && <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>}
            </div>
        </div>
    );
};

// The custom mode's settings: which operations, the two ranges for each kind, and the time.
const CustomSettings = ({settings, onChange}: {settings: ArithmeticSettings; onChange: (s: ArithmeticSettings) => void}) => {
    const toggle = (op: Operation) => {
        const has = settings.operations.includes(op);
        onChange({...settings, operations: OPERATIONS.filter((o) => (o === op ? !has : settings.operations.includes(o)))});
    };
    const bound = (key: 'addLeft' | 'addRight' | 'multiplyLeft' | 'multiplyRight', end: 'min' | 'max') => (
        <TextField
            type="number"
            inputMode="numeric"
            aria-label={ARITHMETIC_COPY.bounds[key][end]}
            value={String(settings[key][end])}
            onChange={(event) => onChange({...settings, [key]: {...settings[key], [end]: Math.trunc(Number(event.target.value))}})}
            className="w-20"
            data-range={`${key}-${end}`}
        />
    );
    return (
        <div className="space-y-4" data-custom-settings>
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                {OPERATIONS.map((op) => (
                    <label key={op} className="flex items-center gap-2 text-sm text-fg">
                        <input type="checkbox" checked={settings.operations.includes(op)} onChange={() => toggle(op)} data-operation={op}/>
                        {ARITHMETIC_COPY.operations[op]}
                    </label>
                ))}
            </fieldset>
            <div className="space-y-2 text-sm text-fg-soft">
                <MicroLabel as="p">{ARITHMETIC_COPY.rangesHeading}</MicroLabel>
                <div className="flex flex-wrap items-center gap-2">
                    {ARITHMETIC_COPY.addRange} {bound('addLeft', 'min')} {ARITHMETIC_COPY.rangeTo} {bound('addLeft', 'max')}
                    {ARITHMETIC_COPY.addBy} {bound('addRight', 'min')} {ARITHMETIC_COPY.rangeTo} {bound('addRight', 'max')}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {ARITHMETIC_COPY.multiplyRange} {bound('multiplyLeft', 'min')} {ARITHMETIC_COPY.rangeTo} {bound('multiplyLeft', 'max')}
                    {ARITHMETIC_COPY.multiplyBy} {bound('multiplyRight', 'min')} {ARITHMETIC_COPY.rangeTo} {bound('multiplyRight', 'max')}
                </div>
                <p className="text-xs text-fg-muted">{ARITHMETIC_COPY.reverseNote}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-fg">
                {ARITHMETIC_COPY.durationLabel}
                <select value={settings.duration} onChange={(event) => onChange({...settings, duration: Number(event.target.value) as ArithmeticSettings['duration']})}
                        className={fieldClass('w-28')} data-duration>
                    {DURATIONS.map((d) => <option key={d} value={d}>{ARITHMETIC_COPY.duration(d)}</option>)}
                </select>
            </label>
        </div>
    );
};

export default ArithmeticGame;
