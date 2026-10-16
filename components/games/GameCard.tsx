import type {ReactNode} from "react";
import Link from "next/link";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import {actionButton} from "@/components/primitives/ActionButton";

type Stat = {label: string; value: string; hint?: string};

type Body = {body: string; stats: Stat[]; href: string; cta: string; aside?: ReactNode};

// What a game's card says under its title: what it is, the reader's records in it, an aside the
// game may add, and the way in. Frameless, so Lab › Today draws it inside its own card
// (components/lab/LabWidgetBody) and the hub inside GameCard below.
export const GameCardBody = ({body, stats, href, cta, aside}: Body) => (
    <>
        <p className="text-sm leading-relaxed text-fg-soft">{body}</p>
        {stats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {stats.map((stat) => <StatTile key={stat.label} label={stat.label} value={stat.value} hint={stat.hint}/>)}
            </div>
        )}
        {aside}
        <div className="mt-auto pt-5">
            <Link href={href} className={actionButton({variant: 'secondary', size: 'md'})}>{cta}</Link>
        </div>
    </>
);

// One game on the hub: the card body in a Panel under the game's title.
const GameCard = ({id, title, ...body}: Body & {id: string; title: string}) => (
    <Panel id={`game-${id}`} aria-labelledby={`game-${id}-heading`} className="flex flex-col" data-game-card={id}>
        <SectionHeading id={`game-${id}-heading`}>{title}</SectionHeading>
        <GameCardBody {...body}/>
    </Panel>
);

export default GameCard;
