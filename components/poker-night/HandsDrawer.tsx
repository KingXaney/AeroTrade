'use client';

// The Hands guide at the table (P2), in its drawer, "Hands and games": opened from the top bar's menu
// (Hands) and the H key (lib/poker-night/keys ROOM_KEYS), mounted for every viewer, a visitor
// included. The table's own game comes first ("At this table"), and the examples are drawn in the
// viewer's card face and colours (room.personal). Nothing here reads or writes the room: the guide is
// lib/poker-night/hands-guide's, the same one the lobby's Hands tab shows.

import HandsGuide from "@/components/poker-night/HandsGuide";
import {Drawer} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {HANDS_COPY} from "@/lib/learn/copy/poker-night";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

const HandsDrawer = ({open, onOpenChange, toTable}: Props) => {
    const room = useRoom();
    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={HANDS_COPY.sheetTitle} toTable={toTable} wide data-pn-drawer="hands">
            {/* Every table deals Texas hold'em for now; the table's own mode takes this place once there are others. */}
            <HandsGuide focus="holdem" face={room.personal.cardFace} four={room.personal.fourColour} level="h3"/>
        </Drawer>
    );
};

export default HandsDrawer;
