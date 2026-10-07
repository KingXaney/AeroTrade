// The dealer button on the felt beside the button seat's plate, where lib/poker-night/stage put it:
// a white disc marked "D" (rounded-full, so it stays round in brutalist). Its name says what it is.

import type {Px} from "@/lib/poker-night/stage";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";

const DealerButton = ({at}: {at: Px}) => (
    <span className="pn-dealer rounded-full" style={{left: at.x, top: at.y}} role="img" aria-label={TABLE_COPY.markerNames.dealer} data-pn-dealer="">
        <span aria-hidden="true">{TABLE_COPY.markers.dealer}</span>
    </span>
);

export default DealerButton;
