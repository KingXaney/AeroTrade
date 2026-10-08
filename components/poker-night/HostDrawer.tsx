'use client';

// The host's controls, in their drawer, one section at a time:
// - Game: the game itself (Texas hold'em or PLO, GameChoice), the blinds, the ante, the starting
//   chips and the chip cap, the turn timer;
// - Rebuys: the policy (Off / On, the host approving: RebuyChoice), the rebuys per player, and the
//   requests for chips waiting for the host (the bank's own rows);
// - Players: everyone at the table, each with a More menu (sit out next hand — the bank's own, through
//   useHostSitOut and the map TableOverlays keeps for both — hand over host, remove from table), and
//   the removed with "Let back in";
// - Table: its name, deal / pause / resume, lock, show to friends, and end the night;
// - Look (P5): the scene and the felt (LookPicker) and whether throwables fly — the room's settings,
//   applied at once for everyone (no "from the next hand"), each pick sent as it is made.
// A settings section says once that changes apply from the next hand, checks the change the way the
// engine will (lib/poker-night/overlays.checkGameForm) and sends only what changed. Removing, handing
// over and ending each ask first, in a dialog TableOverlays holds; the drawer steps aside while it
// is up and comes back after.

import {useId, useRef, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {MoreHorizontal} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import ActionButton from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import Switch from "@/components/primitives/Switch";
import TextField, {fieldClass} from "@/components/primitives/TextField";
import {iconButton} from "@/components/primitives/iconButton";
import {RequestsPanel} from "@/components/poker-night/BankPanel";
import LookPicker from "@/components/poker-night/LookPicker";
import GameChoice from "@/components/poker-night/GameChoice";
import RebuyChoice from "@/components/poker-night/RebuyChoice";
import {Drawer, MiniAvatar, PlayerName} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {useHostSitOut, type HostSitOuts} from "@/components/poker-night/useHostSitOut";
import {HOST_COPY, INVITE_COPY, LOOKS_COPY, MODE_COPY, OVERLAY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {TABLE_NAME_INPUT_MAX} from "@/lib/poker-night/input";
import {resolveTableLook, scenePatch, type TableLook} from "@/lib/poker-night/looks";
import {BLIND_PRESETS} from "@/lib/poker-night/lobby";
import {
    checkGameForm, gameFormOf, GAME_FIELDS, hostPeople, hostRowStatus, hostSitOut, REBUY_FIELDS, rebuyLimitChoices, seatedCount, tableControl, timerChoices,
    type GameField, type GameForm, type HostRow,
} from "@/lib/poker-night/overlays";
import {cn} from "@/lib/utils";

export type HostSection = 'game' | 'rebuys' | 'players' | 'table' | 'look';
const SECTIONS: readonly HostSection[] = ['game', 'rebuys', 'players', 'table', 'look'];
const sectionName = (s: HostSection): string => (s === 'look' ? LOOKS_COPY.hostTab : HOST_COPY.sections[s]);

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    toTable: boolean;
    onRemove: (row: HostRow) => void;
    onHandOver: (row: HostRow) => void;
    onEnd: () => void;
    sitOuts: HostSitOuts;
};

// ── the settings sections ──

const Field = ({id, label, hint, children}: {id: string; label: string; hint?: string; children: ReactNode}) => (
    <div className="space-y-1.5">
        <MicroLabel as="label" htmlFor={id}>{label}</MicroLabel>
        {children}
        {hint && <p className="text-[11px] leading-relaxed text-fg-muted">{hint}</p>}
    </div>
);

// One section of the config: its form, its one "from the next hand" line, Save and what it said.
const useConfigForm = (fields: readonly GameField[]) => {
    const room = useRoom();
    const [form, setForm] = useState<GameForm>(() => gameFormOf(room.config));
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const [busy, setBusy] = useState(false);
    const check = checkGameForm(room.config, form, fields);
    const dirty = !check.ok || Object.keys(check.patch).length > 0;

    const set = <K extends GameField>(key: K, value: GameForm[K]) => {
        setStatus(null);
        setForm((prev) => ({...prev, [key]: value}));
    };

    const save = async () => {
        if (busy) return;
        if (!check.ok) {
            setStatus({ok: false, text: check.message});
            return;
        }
        if (Object.keys(check.patch).length === 0) return;
        setBusy(true);
        const r = await room.send({type: 'host', op: {op: 'config', patch: check.patch}});
        setBusy(false);
        setStatus(r.ok ? {ok: true, text: HOST_COPY.saved} : {ok: false, text: r.message});
    };

    return {form, set, save, status, busy, dirty};
};

const SaveRow = ({busy, dirty, status, onSave}: {busy: boolean; dirty: boolean; status: {ok: boolean; text: string} | null; onSave: () => void}) => (
    <div className="space-y-2">
        <p className="text-xs text-fg-muted">{HOST_COPY.fromNextHand}</p>
        <ActionButton variant="strong" size="md" className="min-h-11" disabled={busy || !dirty} aria-busy={busy} onClick={onSave} data-host-save="">
            {HOST_COPY.save}
        </ActionButton>
        {status && <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-xs text-positive' : 'text-xs text-negative'}>{status.text}</p>}
    </div>
);

const GameSection = () => {
    const id = useId();
    const {form, set, save, status, busy, dirty} = useConfigForm(GAME_FIELDS);
    const chip = (key: 'smallBlind' | 'bigBlind' | 'ante' | 'buyInMin' | 'buyInMax', label: string, hint?: string, placeholder?: string) => (
        <Field id={`${id}-${key}`} label={label} hint={hint}>
            <TextField id={`${id}-${key}`} inputMode="numeric" autoComplete="off" className="h-11 w-full" value={form[key]} placeholder={placeholder}
                       onChange={(e) => set(key, e.target.value)} data-host-field={key}/>
        </Field>
    );
    return (
        <Panel pad={4} as="form" className="space-y-4" aria-label={HOST_COPY.sections.game}
               onSubmit={(e) => {
                   e.preventDefault();
                   void save();
               }}>
            <div className="space-y-2" data-host-field="variant">
                <MicroLabel as="p">{MODE_COPY.gameLabel}</MicroLabel>
                <GameChoice value={form.variant} onChange={(variant) => set('variant', variant)} hook="host-game"/>
            </div>
            <div className="space-y-2">
                <MicroLabel as="p">{HOST_COPY.blinds}</MicroLabel>
                <div className="flex flex-wrap gap-1.5">
                    {BLIND_PRESETS.map(([sb, bb]) => {
                        const on = form.smallBlind === String(sb) && form.bigBlind === String(bb);
                        return (
                            <button key={`${sb}/${bb}`} type="button" aria-pressed={on}
                                    className={cn('control-type min-h-11 rounded-lg px-3 text-xs transition-colors',
                                        on ? 'bg-brand text-on-brand' : 'border border-line-strong/40 text-fg-soft hover:text-fg')}
                                    onClick={() => {
                                        set('smallBlind', String(sb));
                                        set('bigBlind', String(bb));
                                    }}>
                                {HOST_COPY.blindsValue(sb, bb)}
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {chip('smallBlind', HOST_COPY.smallBlind)}
                    {chip('bigBlind', HOST_COPY.bigBlind)}
                </div>
            </div>
            {chip('ante', HOST_COPY.ante, undefined, HOST_COPY.anteNone)}
            <div className="grid grid-cols-2 gap-3">
                {chip('buyInMin', HOST_COPY.startingChips, HOST_COPY.startingChipsHint)}
                {chip('buyInMax', HOST_COPY.chipCap, HOST_COPY.chipCapHint)}
            </div>
            <Field id={`${id}-timer`} label={HOST_COPY.timer}>
                <select id={`${id}-timer`} className={fieldClass('h-11 w-full')} value={form.turnSeconds}
                        onChange={(e) => set('turnSeconds', Number(e.target.value))}>
                    {timerChoices(form.turnSeconds).map((s) => <option key={s} value={s}>{HOST_COPY.timerValue(s)}</option>)}
                </select>
            </Field>
            <SaveRow busy={busy} dirty={dirty} status={status} onSave={() => void save()}/>
        </Panel>
    );
};

const RebuysSection = () => {
    const id = useId();
    const {form, set, save, status, busy, dirty} = useConfigForm(REBUY_FIELDS);
    return (
        <>
            <RequestsPanel/>
            <Panel pad={4} as="form" className="space-y-4" aria-label={HOST_COPY.sections.rebuys}
                   onSubmit={(e) => {
                       e.preventDefault();
                       void save();
                   }}>
                <div className="space-y-1.5" data-host-field="rebuys">
                    <MicroLabel as="p">{HOST_COPY.rebuys}</MicroLabel>
                    <RebuyChoice value={form.rebuys} onChange={(policy) => set('rebuys', policy)} hintId={`${id}-policy-hint`} hook="host-rebuys"/>
                </div>
                <Field id={`${id}-limit`} label={HOST_COPY.rebuyLimitLabel}>
                    <select id={`${id}-limit`} className={fieldClass('h-11 w-full', 'body')} value={form.maxRebuys ?? ''}
                            onChange={(e) => set('maxRebuys', e.target.value === '' ? null : Number(e.target.value))} data-host-field="maxRebuys">
                        {rebuyLimitChoices(form.maxRebuys).map((n) => <option key={n ?? 'none'} value={n ?? ''}>{HOST_COPY.rebuyLimit(n)}</option>)}
                    </select>
                </Field>
                <SaveRow busy={busy} dirty={dirty} status={status} onSave={() => void save()}/>
            </Panel>
        </>
    );
};

// ── players ──

const PlayersSection = ({onRemove, onHandOver, sitOuts}: Pick<Props, 'onRemove' | 'onHandOver' | 'sitOuts'>) => {
    const room = useRoom();
    const id = useId();
    const [busy, setBusy] = useState<string | null>(null);
    const {players, removed} = hostPeople(room.table, room.me?.pid ?? null);
    const hostSitOuts = useHostSitOut(sitOuts);
    const sitOutOf = (pid: string) => (room.view ? hostSitOut(room.view, pid, sitOuts.waiting[pid] ?? null) : null);

    const letBackIn = async (pid: string, name: string) => {
        if (busy) return;
        setBusy(pid);
        const r = await room.send({type: 'unban', pid});
        setBusy(null);
        if (r.ok) toast.success(HOST_COPY.letBackInDone(name));
        else toast.error(r.message);
    };

    return (
        <>
            <Panel pad={4} className="space-y-2" aria-labelledby={`${id}-players`}>
                <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-players`}>{HOST_COPY.sections.players}</SectionHeading>
                <ul className="space-y-2" data-host-players="">
                    {players.map((row) => (
                        <RowCard as="li" key={row.pid} className="flex items-center gap-3 px-3 py-2" data-host-player={row.pid}>
                            <MiniAvatar avatar={row.avatar}/>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <PlayerName name={row.name} className="text-sm text-fg"/>
                                    {row.host && <Badge tone="brand">{HOST_COPY.hostBadge}</Badge>}
                                    {row.me && <Badge>{HOST_COPY.you}</Badge>}
                                </div>
                                <p className="truncate text-[11px] text-fg-muted">{hostRowStatus(row)}</p>
                                {sitOutOf(row.pid) === 'waiting' && (
                                    <p className="text-[11px] text-fg-muted" data-host-sit-out-waiting="">{HOST_COPY.sitOutWaiting}</p>
                                )}
                            </div>
                            {!row.me && (
                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" className={cn(iconButton, 'size-11')} aria-label={HOST_COPY.moreFor(row.name)} data-host-more="">
                                            <MoreHorizontal className="size-5" aria-hidden="true"/>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="z-[70] w-56 text-fg">
                                        {sitOutOf(row.pid) === 'offer' && (
                                            <DropdownMenuItem className="min-h-11 px-3 text-sm" disabled={hostSitOuts.busy !== null}
                                                              onSelect={() => void hostSitOuts.sitOut(row.pid, row.name)} data-host-menu-sit-out="">
                                                {HOST_COPY.sitOut}
                                            </DropdownMenuItem>
                                        )}
                                        {!row.host && (
                                            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => onHandOver(row)} data-host-handover="">
                                                {HOST_COPY.handOver}
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem variant="destructive" className="min-h-11 px-3 text-sm" onSelect={() => onRemove(row)} data-host-remove="">
                                            {HOST_COPY.removeFromTable}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </RowCard>
                    ))}
                </ul>
            </Panel>
            {removed.length > 0 && (
                <Panel pad={4} className="space-y-2" aria-labelledby={`${id}-removed`} data-host-removed="">
                    <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-removed`}>{HOST_COPY.removedHeading}</SectionHeading>
                    <ul className="space-y-2">
                        {removed.map((row) => (
                            <RowCard as="li" key={row.pid} className="flex items-center gap-3 px-3 py-2" data-removed-player={row.pid}>
                                <MiniAvatar avatar={row.avatar}/>
                                <div className="min-w-0 flex-1">
                                    <PlayerName name={row.name} className="block text-sm text-fg"/>
                                    <p className="text-[11px] text-fg-muted">{HOST_COPY.removed}</p>
                                </div>
                                <ActionButton variant="secondary" size="sm" className="min-h-11" disabled={busy !== null}
                                              onClick={() => void letBackIn(row.pid, row.name)} data-let-back-in="">
                                    {HOST_COPY.letBackIn}
                                </ActionButton>
                            </RowCard>
                        ))}
                    </ul>
                </Panel>
            )}
        </>
    );
};

// ── the table ──

const SwitchRow = ({id, label, hint, checked, disabled, onChange, hook}: {
    id: string; label: string; hint: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void; hook: string;
}) => (
    <div className="flex min-h-11 items-start justify-between gap-4">
        <div className="min-w-0">
            <label htmlFor={id} className="text-sm text-fg">{label}</label>
            <p className="text-[11px] leading-relaxed text-fg-muted">{hint}</p>
        </div>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-1" data-host-switch={hook}/>
    </div>
);

const TableSection = ({onEnd}: Pick<Props, 'onEnd'>) => {
    const room = useRoom();
    const id = useId();
    const table = room.table;
    const [name, setName] = useState(table.settings.name);
    const [busy, setBusy] = useState(false);
    const control = tableControl(table);

    const send = async (op: Parameters<typeof room.send>[0], done?: string) => {
        if (busy) return false;
        setBusy(true);
        const r = await room.send(op);
        setBusy(false);
        if (!r.ok) toast.error(r.message);
        else if (done) toast.success(done);
        return r.ok;
    };

    const settings = (patch: {name?: string; locked?: boolean; showToFriends?: boolean}, done?: string) =>
        send({type: 'host', op: {op: 'settings', patch}}, done);

    return (
        <>
            <Panel pad={4} as="form" className="space-y-2" aria-label={HOST_COPY.tableName}
                   onSubmit={(e) => {
                       e.preventDefault();
                       void settings({name}, HOST_COPY.saved);
                   }}>
                <MicroLabel as="label" htmlFor={`${id}-name`}>{HOST_COPY.tableName}</MicroLabel>
                <div className="flex gap-2">
                    <TextField id={`${id}-name`} font="body" className="h-11 min-w-0 flex-1" value={name} maxLength={TABLE_NAME_INPUT_MAX}
                               onChange={(e) => setName(e.target.value)} data-user-text=""/>
                    <ActionButton type="submit" variant="secondary" size="md" className="min-h-11" disabled={busy || name === table.settings.name}>
                        {HOST_COPY.save}
                    </ActionButton>
                </div>
            </Panel>

            <Panel pad={4} className="space-y-4">
                {control === 'deal' && (
                    <div className="space-y-1.5">
                        <ActionButton variant="strong" size="md" className="min-h-11 w-full" disabled={busy || seatedCount(table) < 2}
                                      onClick={() => void send({type: 'host', op: {op: 'start'}})} data-host-deal="">
                            {INVITE_COPY.deal}
                        </ActionButton>
                        {seatedCount(table) < 2 && <p className="text-xs text-fg-muted">{INVITE_COPY.needTwo}</p>}
                    </div>
                )}
                {control === 'pause' && (
                    <div className="space-y-1.5">
                        <ActionButton variant="secondary" size="md" className="min-h-11 w-full" disabled={busy}
                                      onClick={() => void send({type: 'host', op: {op: 'pause'}})} data-host-pause="">
                            {HOST_COPY.pause}
                        </ActionButton>
                        <p className="text-xs text-fg-muted">{HOST_COPY.pauseNote}</p>
                    </div>
                )}
                {control === 'resume' && (
                    <div className="space-y-1.5">
                        <p className="text-xs text-fg-soft">{TABLE_COPY.paused}</p>
                        <ActionButton variant="primary" size="md" className="min-h-11 w-full" disabled={busy}
                                      onClick={() => void send({type: 'host', op: {op: 'resume'}})} data-host-resume="">
                            {HOST_COPY.resume}
                        </ActionButton>
                    </div>
                )}
                {table.closing && <p className="text-xs text-fg-soft">{TABLE_COPY.closing}</p>}
                <SwitchRow id={`${id}-lock`} label={HOST_COPY.lock} hint={HOST_COPY.lockHint} checked={table.settings.locked} disabled={busy}
                           onChange={(locked) => void settings({locked})} hook="locked"/>
                {room.hasAccount && (
                    <SwitchRow id={`${id}-friends`} label={HOST_COPY.showToFriends} hint={HOST_COPY.showToFriendsHint}
                               checked={table.settings.showToFriends} disabled={busy} onChange={(showToFriends) => void settings({showToFriends})} hook="friends"/>
                )}
            </Panel>

            {!table.closing && (
                <Panel pad={4} className="space-y-2">
                    <ActionButton variant="danger" size="md" className="min-h-11 w-full" onClick={onEnd} data-host-end="">
                        {HOST_COPY.end}
                    </ActionButton>
                    <p className="text-xs text-fg-muted">{HOST_COPY.endBody}</p>
                </Panel>
            )}
        </>
    );
};

// ── the look ──

// The scene, the felt and the throwables: each pick sent at once as the room's settings, shown at
// once (the pick waits as "pending" until the table's answer), turned back with a toast if refused.
const LookSection = () => {
    const room = useRoom();
    const id = useId();
    const table = room.table;
    const [pending, setPending] = useState<Partial<TableLook> & {throwables?: boolean} | null>(null);
    const current = resolveTableLook(table.settings);
    const shown: TableLook = {...current, ...(pending?.scene ? {scene: pending.scene} : {}), ...(pending?.felt ? {felt: pending.felt} : {})};
    const throwables = pending?.throwables ?? table.settings.throwables;
    const latest = useRef(0);

    const apply = async (patch: Partial<TableLook> & {throwables?: boolean}) => {
        const mine = ++latest.current;
        setPending((prev) => ({...prev, ...patch}));
        const r = await room.send({type: 'host', op: {op: 'settings', patch}});
        if (latest.current === mine) setPending(null);
        if (!r.ok) toast.error(r.message);
    };

    return (
        <>
            <Panel pad={4} className="space-y-3" aria-labelledby={`${id}-look`} data-host-look="">
                <div className="space-y-1">
                    <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-look`}>{LOOKS_COPY.hostTab}</SectionHeading>
                    <p className="text-xs leading-relaxed text-fg-muted">{LOOKS_COPY.hostLead}</p>
                </div>
                <LookPicker look={shown} onScene={(scene) => void apply(scenePatch(scene))} onFelt={(felt) => void apply({felt})}/>
                {room.hasAccount && <p className="text-[11px] text-fg-muted">{LOOKS_COPY.hostSaved}</p>}
            </Panel>
            <Panel pad={4}>
                <SwitchRow id={`${id}-throwables`} label={LOOKS_COPY.throwables} hint={LOOKS_COPY.throwablesHint} checked={throwables} disabled={false}
                           onChange={(on) => void apply({throwables: on})} hook="throwables"/>
            </Panel>
        </>
    );
};

// ── the drawer ──

const HostDrawer = ({open, onOpenChange, toTable, onRemove, onHandOver, onEnd, sitOuts}: Props) => {
    const room = useRoom();
    const id = useId();
    const [section, setSection] = useState<HostSection>('game');
    const waiting = room.table.requests.length;

    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={HOST_COPY.heading} toTable={toTable} wide data-pn-drawer="host">
            <div role="tablist" aria-label={OVERLAY_COPY.sectionsLabel} className="grid grid-cols-5 gap-1 rounded-lg bg-surface-2/60 p-1">
                {SECTIONS.map((s) => {
                    const on = s === section;
                    return (
                        <button key={s} type="button" role="tab" id={`${id}-tab-${s}`} aria-selected={on} aria-controls={`${id}-panel`}
                                tabIndex={on ? 0 : -1} data-host-tab={s}
                                className={cn('control-type relative min-h-11 rounded-md px-1 text-xs transition-colors',
                                    on ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg')}
                                onClick={() => setSection(s)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                                    e.preventDefault();
                                    const next = SECTIONS[(SECTIONS.indexOf(s) + (e.key === 'ArrowRight' ? 1 : SECTIONS.length - 1)) % SECTIONS.length];
                                    setSection(next);
                                    document.getElementById(`${id}-tab-${next}`)?.focus();
                                }}>
                            {sectionName(s)}
                            {s === 'rebuys' && waiting > 0 && (
                                <>
                                    <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warning"/>
                                    <span className="sr-only">{HOST_COPY.requests(waiting)}</span>
                                </>
                            )}
                        </button>
                    );
                })}
            </div>
            <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${section}`} className="space-y-4" data-host-section={section}>
                {section === 'game' && <GameSection/>}
                {section === 'rebuys' && <RebuysSection/>}
                {section === 'players' && <PlayersSection onRemove={onRemove} onHandOver={onHandOver} sitOuts={sitOuts}/>}
                {section === 'table' && <TableSection onEnd={onEnd}/>}
                {section === 'look' && <LookSection/>}
            </div>
        </Drawer>
    );
};

export default HostDrawer;
