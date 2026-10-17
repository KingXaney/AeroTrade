'use client';

import {useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition} from "react";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {recordGameRound, type RoundActionResult} from "@/lib/actions/games.actions";
import {ArithmeticSettingsSchema, DURATIONS, OPERATIONS, ZETAMAC_DEFAULTS, isPractice, problemText, type ArithmeticSettings, type Duration, type Operation} from "@/lib/games/arithmetic";
import {familyOf, type CellFamily, type CellId} from "@/lib/games/arithmetic-cells";
import {foldSolved, type CellStat} from "@/lib/games/arithmetic-skill";
import {LOBBY, roundReducer, roundReport, roundScore} from "@/lib/games/arithmetic-round";
import {INTERVIEW_QUESTIONS, OPTION_COUNT} from "@/lib/games/interview";
import {ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import StatTile from "@/components/primitives/StatTile";
import TextField, {fieldClass} from "@/components/primitives/TextField";
import Sparkline from "@/components/games/Sparkline";

export type ArithmeticMode = 'sprint' | 'custom' | 'practice' | 'interview';
type Summary = {record: number | null; recent: number[]};

type Props = {
    mode: ArithmeticMode;
    // The record and last rounds on this mode's settings; null for custom and practice, which
    // have none until played.
    summary: Summary | null;
    // Practice only: the kinds of problem the round is drawn from (lib/games/arithmetic-cells).
    focus?: readonly CellId[];
};

type Saved = Extract<RoundActionResult, {success: true}> | {success: false; message: string} | null;

// A fresh seed per round, taken in the click that starts it (never during render).
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;

const PRACTICE_DURATION: Duration = 60;

// The custom settings and the practice time are kept in this browser (localStorage, read through
// useSyncExternalStore as the poker-night lobby reads its look), so a reload, a tab change or
// the page's refresh after a round's save never hands the sprint back its defaults. The server
// renders the defaults; the browser's value takes over on hydration. A blocked store keeps the
// session's settings in memory.
const CUSTOM_KEY = 'aero-arithmetic:custom';
const PRACTICE_KEY = 'aero-arithmetic:practice-duration';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const memory = new Map<string, string>();
const readRaw = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
        return memory.get(key) ?? null;
    }
};
const writeRaw = (key: string, value: unknown): void => {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    try {
        window.localStorage.setItem(key, raw);
    } catch {
        // Kept in memory for the session.
    }
    listeners.forEach((listener) => listener());
};
const nothingOnServer = () => null;

const parseJson = (raw: string | null): unknown => {
    if (raw === null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const isDuration = (value: unknown): value is Duration => typeof value === 'number' && (DURATIONS as readonly number[]).includes(value);

// The stored settings as typed, invalid ranges included: a range the player is still editing
// must stay on the form, so the schema is checked only when a round starts (and the stored
// value is read back as the shape, not validated).
const isSettingsShape = (value: unknown): value is ArithmeticSettings => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    if (!Array.isArray(candidate.operations)) return false;
    return (Object.keys(ZETAMAC_DEFAULTS) as (keyof ArithmeticSettings)[]).every((key) => key === 'operations' || key === 'duration' || (
        typeof candidate[key] === 'object' && candidate[key] !== null
        && typeof (candidate[key] as {min?: unknown}).min === 'number' && typeof (candidate[key] as {max?: unknown}).max === 'number'
    )) && typeof candidate.duration === 'number';
};

// Zetamac-style mental arithmetic, its custom mode, a practice mode on the kinds that take the
// reader longest, and the 80-in-8 interview mode. The round is the pure reducer in
// lib/games/arithmetic-round.ts; this component owns its clock, its keys and the report it sends
// when the round ends — the server keeps a round only if a person could have played it
// (lib/games/rounds.keptRound), replaying its seed, and answers with the record. Every answer
// is timed by the reducer; the end of a round shows this round's kinds from that, and the page's
// skill panel shows the reader's aggregate once the server has folded the round in.
const ArithmeticGame = ({mode, summary, focus = []}: Props) => {
    const [round, dispatch] = useReducer(roundReducer, LOBBY);
    const customRaw = useSyncExternalStore(subscribe, () => readRaw(CUSTOM_KEY), nothingOnServer);
    const practiceRaw = useSyncExternalStore(subscribe, () => readRaw(PRACTICE_KEY), nothingOnServer);
    const settings = useMemo((): ArithmeticSettings => {
        const stored = parseJson(customRaw);
        return isSettingsShape(stored) ? stored : ZETAMAC_DEFAULTS;
    }, [customRaw]);
    const practiceDuration = useMemo((): Duration => {
        const stored = parseJson(practiceRaw);
        return isDuration(stored) ? stored : PRACTICE_DURATION;
    }, [practiceRaw]);
    const [invalid, setInvalid] = useState(false);
    const [saved, setSaved] = useState<Saved>(null);
    const [saving, startSaving] = useTransition();
    const savedFor = useRef<number | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const interview = mode === 'interview';
    const playing = round.kind !== 'lobby' && round.phase === 'playing';

    const changeSettings = (next: ArithmeticSettings) => writeRaw(CUSTOM_KEY, next);
    const changePracticeDuration = (next: Duration) => writeRaw(PRACTICE_KEY, next);

    const start = () => {
        if (mode === 'custom' && !ArithmeticSettingsSchema.safeParse(settings).success) {
            setInvalid(true);
            return;
        }
        if (mode === 'practice' && focus.length === 0) return;
        setInvalid(false);
        setSaved(null);
        const at = Date.now();
        if (interview) dispatch({type: 'start-interview', seed: freshSeed(), at});
        else if (mode === 'practice') dispatch({type: 'start-sprint', seed: freshSeed(), settings: {cells: [...focus], duration: practiceDuration}, at});
        else dispatch({type: 'start-sprint', seed: freshSeed(), settings, at});
    };

    // A fresh round on the same settings without ending this one, which is dropped unsaved (the
    // reducer's restart). The answer box takes the focus back, so Tab then Enter restarts again.
    const restart = () => {
        dispatch({type: 'restart', seed: freshSeed(), at: Date.now()});
        if (!interview) input.current?.focus();
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
                            onChange={(event) => dispatch({type: 'type', value: event.target.value, at: Date.now()})}
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={10}
                            className="mx-auto block w-48 text-center text-2xl"
                            data-arithmetic-answer
                        />
                    </div>
                )}
                {/* Restart first: the next stop after the answer box, so Tab then Enter reaches it. */}
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <ActionButton variant="secondary" onClick={restart} title={ARITHMETIC_COPY.restartTitle} data-round-restart>{ARITHMETIC_COPY.restart}</ActionButton>
                        <ActionButton variant="secondary" onClick={() => dispatch({type: 'stop', at: Date.now()})} data-round-stop>{ARITHMETIC_COPY.stop}</ActionButton>
                    </div>
                    {round.kind === 'sprint' && <p className="text-center font-mono text-[11px] text-fg-muted" data-restart-keys>{ARITHMETIC_COPY.restartKeys}</p>}
                </div>
            </div>
        );
    }

    if (round.kind !== 'lobby') {
        const score = roundScore(round);
        const elapsed = Math.max(1, round.now - round.startedAt) / 1000;
        const cells = round.kind === 'sprint' ? roundCells(foldSolved({}, round.solved)) : [];
        const slips = round.kind === 'sprint' ? round.solved.reduce((sum, s) => sum + s.slips, 0) : 0;
        return (
            <div className="space-y-5" data-arithmetic-done={mode} data-round-final={score}>
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                    <StatTile label={ARITHMETIC_COPY.scoreHeading} value={score.toLocaleString('en-US')} valueClass="text-4xl"/>
                    {round.kind === 'interview' && <p className="font-mono text-sm text-fg-soft" data-round-wrong={round.wrong}>{ARITHMETIC_COPY.wrong(round.wrong)}</p>}
                    {score > 0 && <p className="font-mono text-sm text-fg-soft">{ARITHMETIC_COPY.perProblem(elapsed / score)}</p>}
                </div>
                {round.kind === 'sprint' && (
                    <ul className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-fg-muted" data-round-detail>
                        {(isPractice(round.settings) ? OPERATIONS.filter((op) => round.counts[op] > 0) : round.settings.operations)
                            .map((op) => <li key={op}>{ARITHMETIC_COPY.operations[op]}: {round.counts[op]}</li>)}
                    </ul>
                )}
                {cells.length > 0 && (
                    <div>
                        <MicroLabel as="p" className="mb-1">{ARITHMETIC_COPY.roundCellsHeading}</MicroLabel>
                        <ul className="space-y-0.5 font-mono text-xs text-fg-soft" data-round-cells>
                            {cells.map(({cell, stat}) => (
                                <li key={cell} data-round-cell={cell}>{ARITHMETIC_COPY.cellLabel(cell)}: {ARITHMETIC_COPY.cellLine(stat.ms / stat.n / 1000, stat.n)}</li>
                            ))}
                        </ul>
                        {slips > 0 && <p className="mt-1 font-mono text-xs text-fg-muted" data-round-slips={slips}>{ARITHMETIC_COPY.slips(slips)}</p>}
                    </div>
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
                <div className="flex flex-wrap items-center gap-3">
                    <ActionButton size="md" onClick={start} disabled={saving} data-round-again>{ARITHMETIC_COPY.playAgain}</ActionButton>
                    {(mode === 'custom' || mode === 'practice') && (
                        <ActionButton variant="secondary" size="md" onClick={() => dispatch({type: 'reset'})} disabled={saving} data-round-settings>
                            {ARITHMETIC_COPY.changeSettings}
                        </ActionButton>
                    )}
                </div>
            </div>
        );
    }

    const lead = mode === 'sprint' ? ARITHMETIC_COPY.sprintLead
        : mode === 'custom' ? ARITHMETIC_COPY.customLead
            : mode === 'practice' ? ARITHMETIC_COPY.practiceLead
                : ARITHMETIC_COPY.interviewLead;
    const canStart = mode !== 'practice' || focus.length > 0;
    return (
        <div className="space-y-5" data-arithmetic-lobby={mode}>
            <p className="text-sm leading-relaxed text-fg-soft">{lead}</p>
            {mode === 'custom' && <CustomSettings settings={settings} onChange={changeSettings}/>}
            {mode === 'practice' && (
                focus.length === 0
                    ? <p className="text-sm text-fg-muted" data-practice-empty>{ARITHMETIC_COPY.practiceEmpty}</p>
                    : <PracticeFocus focus={focus} duration={practiceDuration} onDuration={changePracticeDuration}/>
            )}
            {(mode === 'custom' || mode === 'practice') && <MicroLabel as="p" className="normal-case tracking-normal" data-settings-kept>{ARITHMETIC_COPY.settingsKept}</MicroLabel>}
            {invalid && <p className="text-sm text-warning" role="alert" data-custom-invalid>{ARITHMETIC_COPY.invalid}</p>}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {canStart && <ActionButton size="md" onClick={start} data-round-start>{ARITHMETIC_COPY.start}</ActionButton>}
                {record !== null && <span className="font-mono text-xs text-fg-muted" data-lobby-record={record}>{ARITHMETIC_COPY.record(record)}</span>}
                {recent.length > 1 && <Sparkline scores={recent} label={ARITHMETIC_COPY.recentHeading}/>}
            </div>
        </div>
    );
};

// A round's answered problems by kind, the slowest kind first.
const roundCells = (folded: Partial<Record<CellId, CellStat>>): {cell: CellId; stat: CellStat}[] =>
    (Object.entries(folded) as [CellId, CellStat | undefined][])
        .flatMap(([cell, stat]) => (stat && stat.n > 0 ? [{cell, stat}] : []))
        .sort((a, b) => b.stat.ms / b.stat.n - a.stat.ms / a.stat.n);

// The practice lobby: the kinds this round is drawn from, one method line a family, the time.
const PracticeFocus = ({focus, duration, onDuration}: {focus: readonly CellId[]; duration: Duration; onDuration: (d: Duration) => void}) => {
    const families = [...new Set(focus.map(familyOf))] as CellFamily[];
    return (
        <div className="space-y-3">
            <div>
                <MicroLabel as="p" className="mb-1">{ARITHMETIC_COPY.practiceFocus}</MicroLabel>
                <ul className="flex flex-wrap gap-2" data-practice-focus={focus.join(',')}>
                    {focus.map((cell) => <li key={cell} className="row-card px-2.5 py-1 font-mono text-xs text-fg" data-focus-cell={cell}>{ARITHMETIC_COPY.cellLabel(cell)}</li>)}
                </ul>
            </div>
            <ul className="space-y-1 text-xs text-fg-muted">
                {families.map((family) => <li key={family} data-practice-method={family}>{ARITHMETIC_COPY.methods[family]}</li>)}
            </ul>
            <DurationSelect value={duration} onChange={onDuration}/>
        </div>
    );
};

const DurationSelect = ({value, onChange}: {value: Duration; onChange: (d: Duration) => void}) => (
    <label className="flex items-center gap-2 text-sm text-fg">
        {ARITHMETIC_COPY.durationLabel}
        <select value={value} onChange={(event) => onChange(Number(event.target.value) as Duration)} className={fieldClass('w-28')} data-duration>
            {DURATIONS.map((d) => <option key={d} value={d}>{ARITHMETIC_COPY.duration(d)}</option>)}
        </select>
    </label>
);

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
            <DurationSelect value={settings.duration} onChange={(duration) => onChange({...settings, duration})}/>
        </div>
    );
};

export default ArithmeticGame;
