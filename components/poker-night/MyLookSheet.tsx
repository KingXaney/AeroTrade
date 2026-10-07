'use client';

// My look at the table, until the look builder arrives (P5): the name and the rolled look everyone
// here sees, changed between hands through the room's 'profile' action, and kept in this browser
// for the next table (the room's setProfile). Below it, this browser's own switch for the table's
// single-key shortcuts (the room's personal look, setPersonal), so they can be turned off.

import {useId, useState} from "react";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import Switch from "@/components/primitives/Switch";
import TextField from "@/components/primitives/TextField";
import {Drawer, MiniAvatar} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {AVATAR_COPY, JOIN_COPY, OVERLAY_COPY} from "@/lib/learn/copy/poker-night";
import {encodeAvatar, resolveAvatar, rollAvatar} from "@/lib/poker-night/avatar";
import {NAME_INPUT_MAX} from "@/lib/poker-night/input";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

const LookForm = () => {
    const room = useRoom();
    const id = useId();
    const pid = room.me?.pid ?? '';
    const person = room.table.people[pid];
    const [name, setName] = useState(person?.name ?? room.profile.name);
    const [avatar, setAvatar] = useState(person?.avatar ?? room.profile.avatar);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const face = AVATAR_COPY.faces[resolveAvatar(avatar).face];
    const changed = name !== (person?.name ?? '') || avatar !== (person?.avatar ?? '');

    const save = async () => {
        if (busy || !changed) return;
        setBusy(true);
        setStatus(null);
        const r = await room.send({type: 'profile', name, avatar});
        setBusy(false);
        if (!r.ok) {
            setStatus({ok: false, text: r.message});
            return;
        }
        const saved = r.view.people[r.view.me.pid];
        if (saved) {
            setName(saved.name);
            room.setProfile({name: saved.name, avatar: saved.avatar});
        }
        setStatus({ok: true, text: OVERLAY_COPY.lookSaved});
    };

    return (
        <Panel pad={4} as="form" className="space-y-4" aria-label={OVERLAY_COPY.myLook}
               onSubmit={(e) => {
                   e.preventDefault();
                   void save();
               }}>
            <p className="text-xs leading-relaxed text-fg-muted">{OVERLAY_COPY.lookLead}</p>
            <div className="flex items-center gap-4">
                <MiniAvatar avatar={avatar} size="lg"/>
                <ActionButton variant="secondary" size="md" className="min-h-11" data-roll-look=""
                              onClick={() => setAvatar(encodeAvatar(rollAvatar(Math.random)))}>
                    {JOIN_COPY.roll}
                </ActionButton>
            </div>
            <div className="space-y-1.5">
                <MicroLabel as="label" htmlFor={`${id}-name`}>{JOIN_COPY.nameLabel}</MicroLabel>
                <TextField id={`${id}-name`} font="body" className="h-11 w-full" value={name} maxLength={NAME_INPUT_MAX}
                           placeholder={JOIN_COPY.namePlaceholder} autoComplete="nickname" aria-describedby={`${id}-rule`}
                           onChange={(e) => setName(e.target.value)}/>
                <p id={`${id}-rule`} className="text-[11px] text-fg-muted">{name.trim() === '' ? JOIN_COPY.blankName(face) : JOIN_COPY.nameRule}</p>
            </div>
            <ActionButton type="submit" variant="primary" size="md" className="min-h-11" disabled={busy || !changed} aria-busy={busy}>
                {OVERLAY_COPY.lookSave}
            </ActionButton>
            {status && <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-xs text-positive' : 'text-xs text-negative'}>{status.text}</p>}
        </Panel>
    );
};

// The keyboard: single-key shortcuts on or off, for this browser.
const KeysPanel = () => {
    const room = useRoom();
    const id = useId();
    return (
        <Panel pad={4} className="flex items-start justify-between gap-4" data-pn-keys="">
            <div className="min-w-0 space-y-1">
                <MicroLabel as="label" htmlFor={`${id}-keys`}>{OVERLAY_COPY.shortcuts}</MicroLabel>
                <p id={`${id}-keys-hint`} className="text-[11px] leading-relaxed text-fg-muted">{OVERLAY_COPY.shortcutsHint}</p>
            </div>
            <Switch id={`${id}-keys`} checked={room.personal.shortcuts} aria-describedby={`${id}-keys-hint`} className="mt-1"
                    onCheckedChange={(on) => room.setPersonal({shortcuts: on})} data-pn-shortcuts=""/>
        </Panel>
    );
};

const MyLookSheet = ({open, onOpenChange, toTable}: Props) => (
    <Drawer open={open} onOpenChange={onOpenChange} title={OVERLAY_COPY.myLook} toTable={toTable} data-pn-drawer="look">
        <LookForm/>
        <KeysPanel/>
    </Drawer>
);

export default MyLookSheet;
