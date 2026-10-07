// The small and big blind's marks on their plates while the hand is played: "SB" and "BB" on the
// plate's corner, named in full for a screen reader.

import {TABLE_COPY} from "@/lib/learn/copy/poker-night";

const BlindMarker = ({blind}: {blind: 'small' | 'big'}) => (
    <span className="pn-blind chrome-surface text-fg-soft" role="img" aria-label={TABLE_COPY.markerNames[blind]} data-pn-blind={blind}>
        <span aria-hidden="true">{TABLE_COPY.markers[blind]}</span>
    </span>
);

export default BlindMarker;
