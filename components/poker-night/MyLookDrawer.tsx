'use client';

// My look at the table, the top bar's drawer (and the menu's): two panels.
// - You at the table: the name and the avatar everyone here sees — the builder (AvatarBuilder) with
//   its live preview and Roll — saved with the room's 'profile' action and kept in this browser for
//   the next table (the room's setProfile). A seated player's change waits for the hand in play to
//   end (the log and the plates would change names mid-hand): the draft is the room's
//   (profileDraft), so it outlasts the drawer — the viewer's turn closes it — and Save mid-hand
//   queues it, sent by itself when the hand ends.
// - Only you see these: the personal look (PersonalLookControls) — card back and face, four-colour
//   deck, chip colours, sound, vibration, the screen kept on, the hand's name, muted emotes and the
//   single-key shortcuts — each kept in this browser the moment it changes (the room's setPersonal)
//   and drawn at once behind the drawer. Nothing here calls a server action; an account saves the
//   personal look to its preferences from the lobby, which offers it.

import {useId, useState} from "react";
import type {ProfileDraft} from "@/components/poker-night/room-controller";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import AvatarBuilder from "@/components/poker-night/AvatarBuilder";
import PersonalLookControls from "@/components/poker-night/PersonalLookControls";
import {Drawer} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {AVATAR_COPY, JOIN_COPY, LOOKS_COPY, OVERLAY_COPY} from "@/lib/learn/copy/poker-night";
import {resolveAvatar} from "@/lib/poker-night/avatar";
import {NAME_INPUT_MAX} from "@/lib/poker-night/input";
import {profileWaits} from "@/lib/poker-night/overlays";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

const ProfilePanel = () => {
    const room = useRoom();
    const id = useId();
    const pid = room.me?.pid ?? '';
    const person = room.table.people[pid];
    // What the drawer shows: the room's draft when there is one, else the name and look at the table.
    const draft = room.profileDraft;
    const name = draft?.name ?? person?.name ?? room.profile.name;
    const avatar = draft?.avatar ?? person?.avatar ?? room.profile.avatar;
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const face = AVATAR_COPY.faces[resolveAvatar(avatar).face];
    const changed = name !== (person?.name ?? '') || avatar !== (person?.avatar ?? '');
    // A seated player's name and look wait for the hand in play to end; a save then queues them.
    const waiting = profileWaits(room.view);
    const queued = draft?.queued === true && changed;

    const edit = (patch: Partial<ProfileDraft>) => {
        setStatus(null);
        room.setProfileDraft({name, avatar, ...patch, queued: false});
    };

    const save = async () => {
        if (busy || !changed || queued) return;
        setStatus(null);
        if (waiting) {
            room.setProfileDraft({name, avatar, queued: true});
            return;
        }
        setBusy(true);
        const r = await room.send({type: 'profile', name, avatar});
        setBusy(false);
        if (!r.ok) {
            setStatus({ok: false, text: r.message});
            return;
        }
        const saved = r.view.people[r.view.me.pid];
        if (saved) room.setProfile({name: saved.name, avatar: saved.avatar});
        room.setProfileDraft(null);
        setStatus({ok: true, text: OVERLAY_COPY.lookSaved});
    };

    return (
        <Panel pad={4} as="form" className="space-y-4" aria-labelledby={`${id}-you`} data-pn-look-profile=""
               onSubmit={(e) => {
                   e.preventDefault();
                   void save();
               }}>
            <div className="space-y-1">
                <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-you`}>{LOOKS_COPY.youHeading}</SectionHeading>
                <p className="text-xs leading-relaxed text-fg-muted">{OVERLAY_COPY.lookLead}</p>
            </div>
            <AvatarBuilder value={avatar} onChange={(next) => edit({avatar: next})}/>
            <div className="space-y-1.5">
                <MicroLabel as="label" htmlFor={`${id}-name`}>{JOIN_COPY.nameLabel}</MicroLabel>
                <TextField id={`${id}-name`} font="body" className="h-11 w-full" value={name} maxLength={NAME_INPUT_MAX}
                           placeholder={JOIN_COPY.namePlaceholder} autoComplete="nickname" aria-describedby={`${id}-rule`} data-user-text=""
                           onChange={(e) => edit({name: e.target.value})}/>
                <p id={`${id}-rule`} className="text-[11px] text-fg-muted">{name.trim() === '' ? JOIN_COPY.blankName(face) : JOIN_COPY.nameRule}</p>
            </div>
            <div className="space-y-2">
                <ActionButton type="submit" variant="primary" size="md" className="min-h-11" disabled={busy || !changed || queued} aria-busy={busy}
                              data-pn-look-save="" data-pn-look-queued={queued ? '' : undefined}>
                    {OVERLAY_COPY.lookSave}
                </ActionButton>
                {waiting && changed && (
                    <p className="text-xs text-fg-soft" role="status" data-pn-look-wait="">{queued ? LOOKS_COPY.queued : LOOKS_COPY.betweenHands}</p>
                )}
                {status && <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-xs text-positive' : 'text-xs text-negative'}>{status.text}</p>}
            </div>
        </Panel>
    );
};

const ViewPanel = () => {
    const room = useRoom();
    const id = useId();
    return (
        <Panel pad={4} className="space-y-4" aria-labelledby={`${id}-view`} data-pn-keys="">
            <div className="space-y-1">
                <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-view`}>{LOOKS_COPY.viewHeading}</SectionHeading>
                <p className="text-xs leading-relaxed text-fg-muted">{LOOKS_COPY.viewLead}</p>
            </div>
            <PersonalLookControls look={room.personal} onChange={room.setPersonal}/>
        </Panel>
    );
};

const MyLookDrawer = ({open, onOpenChange, toTable}: Props) => (
    <Drawer open={open} onOpenChange={onOpenChange} title={OVERLAY_COPY.myLook} toTable={toTable} wide data-pn-drawer="look">
        <ProfilePanel/>
        <ViewPanel/>
    </Drawer>
);

export default MyLookDrawer;
