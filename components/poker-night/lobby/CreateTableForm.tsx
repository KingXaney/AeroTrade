'use client';

import {useId, useState, useTransition, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createPokerNight} from "@/lib/actions/poker-night.actions";
import {HOST_COPY, LOBBY_COPY, MODE_COPY, POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {checkConfig, DEFAULT_CONFIG, mergeConfig, TABLE_LIMITS} from "@/lib/poker-night/config";
import {
    BLIND_PRESETS, chipOptions, chipsFor, configFromForm, configIssueText, DEFAULT_FORM, invitePath, SEAT_CHOICES, TIMER_PRESETS,
    type TableForm,
} from "@/lib/poker-night/lobby";
import ActionButton from "@/components/primitives/ActionButton";
import BoardsChoice from "@/components/poker-night/BoardsChoice";
import GameChoice from "@/components/poker-night/GameChoice";
import RebuyChoice from "@/components/poker-night/RebuyChoice";
import MicroLabel from "@/components/primitives/MicroLabel";
import Switch from "@/components/primitives/Switch";
import TextField, {fieldClass} from "@/components/primitives/TextField";

// A table set up before anyone sits down (the lobby's "Set it up first"): its game (GameChoice:
// Texas hold'em or PLO, and PLO's one to three boards, BoardsChoice), its name, the blinds,
// the starting chips, the seats, the rebuy policy (Off / On, RebuyChoice), the turn timer and whether friends see it in
// their lobby. Every choice is one lib/poker-night/lobby offers within the config's limits; the
// config is checked here with lib/poker-night/config before it is sent, and again by the action.
// Everything but the seats can be changed at the table.

// A phone's thumb needs the taller field.
const SELECT = fieldClass('h-11 w-full', 'body');

const CreateTableForm = ({hostName}: {hostName: string}) => {
    const router = useRouter();
    const id = useId();
    const [name, setName] = useState(hostName ? POKER_NIGHT_COPY.tableNameDefault(hostName) : '');
    const [form, setForm] = useState<TableForm>({...DEFAULT_FORM});
    const [showToFriends, setShowToFriends] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const set = <K extends keyof TableForm>(key: K, value: TableForm[K]) => setForm((current) => ({...current, [key]: value}));
    const bigBlind = (BLIND_PRESETS[form.blinds] ?? BLIND_PRESETS[DEFAULT_FORM.blinds])[1];
    const chips = chipsFor(form);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const config = configFromForm(form);
        const checked = checkConfig(mergeConfig(DEFAULT_CONFIG, config));
        if (!checked.ok) {
            setError(configIssueText(checked.issues));
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const result = await createPokerNight({name, config, showToFriends});
                if (result.success) router.push(invitePath(result.code));
                else setError(result.message);
            } catch {
                setError(LOBBY_COPY.unreachable);
            }
        });
    };

    const field = (key: string) => `${id}-${key}`;

    return (
        <form onSubmit={submit} className="mt-3 space-y-4" data-create-table="" aria-describedby={error ? field('error') : undefined}>
            <div className="space-y-1.5" data-field="variant">
                <MicroLabel as="p">{MODE_COPY.gameLabel}</MicroLabel>
                <GameChoice value={form.variant} onChange={(variant) => set('variant', variant)} hook="game"/>
            </div>
            {form.variant === 'plo' && <BoardsChoice variant={form.variant} value={form.boards} onChange={(boards) => set('boards', boards)} hook="boards"/>}
            <div className="space-y-1.5">
                <MicroLabel as="label" htmlFor={field('name')}>{POKER_NIGHT_COPY.tableName}</MicroLabel>
                <TextField id={field('name')} font="body" className="h-11 w-full" value={name} maxLength={TABLE_LIMITS.tableName}
                           autoComplete="off" onChange={(e) => setName(e.target.value)} data-field="name"/>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <MicroLabel as="label" htmlFor={field('blinds')}>{LOBBY_COPY.blinds}</MicroLabel>
                    <select id={field('blinds')} className={SELECT} value={form.blinds} data-field="blinds"
                            onChange={(e) => set('blinds', Number(e.target.value))}>
                        {BLIND_PRESETS.map(([sb, bb], i) => <option key={`${sb}/${bb}`} value={i}>{HOST_COPY.blindsValue(sb, bb)}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <MicroLabel as="label" htmlFor={field('chips')}>{LOBBY_COPY.chips}</MicroLabel>
                    <select id={field('chips')} className={SELECT} value={chips} data-field="chips" aria-describedby={field('chips-hint')}
                            onChange={(e) => set('chips', Number(e.target.value))}>
                        {chipOptions(bigBlind).map((n) => <option key={n} value={n}>{TABLE_COPY.chips(n)}</option>)}
                    </select>
                    <p id={field('chips-hint')} className="text-[11px] leading-relaxed text-fg-muted">{LOBBY_COPY.chipsHint}</p>
                </div>
                <div className="space-y-1.5">
                    <MicroLabel as="label" htmlFor={field('seats')}>{POKER_NIGHT_COPY.seats}</MicroLabel>
                    <select id={field('seats')} className={SELECT} value={form.seats} data-field="seats" aria-describedby={field('seats-hint')}
                            onChange={(e) => set('seats', Number(e.target.value))}>
                        {SEAT_CHOICES.map((n) => <option key={n} value={n}>{TABLE_COPY.chips(n)}</option>)}
                    </select>
                    <p id={field('seats-hint')} className="text-[11px] leading-relaxed text-fg-muted">{LOBBY_COPY.seatsHint}</p>
                </div>
                <div className="space-y-1.5" data-field="rebuys">
                    <MicroLabel as="p">{LOBBY_COPY.rebuys}</MicroLabel>
                    <RebuyChoice value={form.rebuys} onChange={(policy) => set('rebuys', policy)} hintId={field('rebuys-hint')} hook="rebuys"/>
                </div>
                <div className="space-y-1.5">
                    <MicroLabel as="label" htmlFor={field('timer')}>{LOBBY_COPY.timer}</MicroLabel>
                    <select id={field('timer')} className={SELECT} value={form.turnSeconds} data-field="timer"
                            onChange={(e) => set('turnSeconds', Number(e.target.value))}>
                        {TIMER_PRESETS.map((s) => <option key={s} value={s}>{HOST_COPY.timerValue(s)}</option>)}
                    </select>
                </div>
            </div>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <label htmlFor={field('friends')} className="text-sm text-fg">{LOBBY_COPY.showToFriends}</label>
                    <p id={field('friends-hint')} className="text-[11px] leading-relaxed text-fg-muted">{LOBBY_COPY.showToFriendsHint}</p>
                </div>
                <Switch id={field('friends')} checked={showToFriends} onCheckedChange={setShowToFriends} aria-describedby={field('friends-hint')}
                        data-field="show-to-friends"/>
            </div>
            {error && <p id={field('error')} role="alert" className="text-xs text-negative" data-create-error="">{error}</p>}
            <ActionButton type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending} className="min-h-11 w-full sm:w-auto">
                {pending ? POKER_NIGHT_COPY.starting : POKER_NIGHT_COPY.create}
            </ActionButton>
        </form>
    );
};

export default CreateTableForm;
