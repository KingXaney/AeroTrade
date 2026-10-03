import Link from "next/link";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import {actionButton} from "@/components/primitives/ActionButton";

type Stat = {label: string; value: string; hint?: string};

// One game on the hub: what it is, the reader's records in it, and the way in.
const GameCard = ({id, title, body, stats, href, cta}: {id: string; title: string; body: string; stats: Stat[]; href: string; cta: string}) => (
    <Panel id={`game-${id}`} aria-labelledby={`game-${id}-heading`} className="flex flex-col" data-game-card={id}>
        <SectionHeading id={`game-${id}-heading`}>{title}</SectionHeading>
        <p className="text-sm leading-relaxed text-fg-soft">{body}</p>
        {stats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {stats.map((stat) => <StatTile key={stat.label} label={stat.label} value={stat.value} hint={stat.hint}/>)}
            </div>
        )}
        <div className="mt-auto pt-5">
            <Link href={href} className={actionButton({variant: 'secondary', size: 'md'})}>{cta}</Link>
        </div>
    </Panel>
);

export default GameCard;
