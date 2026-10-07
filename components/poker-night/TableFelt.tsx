// The felt: a stadium under the seats (lib/poker-night/stage's felt rectangle, so each plate
// straddles the rail), in the host's felt (LOOKS_CSS, [data-pn-felt] on the room) with its betting
// line printed on it; while no pot is out, the table's name printed faintly where the pot goes.
// rounded-full keeps the stadium in brutalist, whose square corners spare that class alone.

import type {Stage} from "@/lib/poker-night/stage";

const TableFelt = ({stage, name, showName}: {stage: Stage; name: string; showName: boolean}) => (
    <>
        <div className="pn-felt rounded-full" style={stage.felt} aria-hidden="true" data-pn-felt-layer=""/>
        {showName && (
            <span className="pn-felt-name" style={{left: stage.pot.x, top: stage.pot.y}} aria-hidden="true" data-user-text="">{name}</span>
        )}
    </>
);

export default TableFelt;
