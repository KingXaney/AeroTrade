'use client';

// What makes the table feel like a game night beyond what it draws (P6), mounted once by
// TableScreen: the sounds on the animations' timeline and the turn's chime and buzz
// (useTableSounds), the screen kept awake while the viewer sits (useWakeLock, the personal
// keepAwake), the room's own keys (useHotkeys) and the list of every key (ShortcutsDialog).

import type {LiveAnim} from "@/components/poker-night/anim";
import ShortcutsDialog from "@/components/poker-night/ShortcutsDialog";
import {useRoom} from "@/components/poker-night/room-controller";
import {useHotkeys} from "@/components/poker-night/useHotkeys";
import {useTableSounds} from "@/components/poker-night/useTableSounds";
import {useWakeLock} from "@/components/poker-night/useWakeLock";

const TableFeel = ({anims}: {anims: readonly LiveAnim[]}) => {
    const room = useRoom();
    useTableSounds(anims);
    useWakeLock(room.me?.seat !== null && room.me?.seat !== undefined && room.personal.keepAwake && room.table.status !== 'closed');
    useHotkeys();
    return room.view ? <ShortcutsDialog/> : null;
};

export default TableFeel;
