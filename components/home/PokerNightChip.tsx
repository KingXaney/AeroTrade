import Link from "next/link";
import {HOME_PANEL_COPY, POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import type {TableLink} from "@/lib/poker-night/lobby";

// Home's way into poker night, beside the streak: a link chip, there whenever poker night is on (the
// page leaves it out with the kill switch on), whatever the reader has going. While the reader holds
// a seat at an open table (lib/poker-night/lobby.homeChipOf, from the panel's own read) it is the way
// straight back to that table — "Rejoin your table", one tap from the top of the page, where the
// panel's own Rejoin sits at its foot; else it opens the lobby. The page draws the lobby's chip first
// and streams the table's in once the read lands. Its recipe is the streak chip's, so the two sit as
// one row. Below lg (a phone either way up, a small tablet) the link around the pill is a full 44 px
// target while the pill keeps its size.
const PokerNightChip = ({rejoin = null}: {rejoin?: TableLink | null}) => (
    <Link href={rejoin ? rejoin.href : "/poker-night"} data-poker-night-chip={rejoin ? 'rejoin' : 'lobby'}
          title={rejoin ? POKER_NIGHT_COPY.resumeTitle(TABLE_COPY.name(rejoin.name, rejoin.code)) : undefined}
          className="group inline-flex items-center max-lg:min-h-11">
        <span className="label-type inline-flex items-center gap-1.5 rounded-full border border-line-strong/40 px-3 py-1 text-[length:var(--label-size)] text-fg-soft transition-colors group-hover:text-fg">
            <span aria-hidden="true" className="material-symbols-outlined text-base leading-none">{rejoin ? 'replay' : 'celebration'}</span>
            {rejoin ? HOME_PANEL_COPY.chipRejoin : HOME_PANEL_COPY.chip}
            {rejoin && <span aria-hidden="true" className="size-1.5 rounded-full bg-positive"/>}
        </span>
    </Link>
);

export default PokerNightChip;
