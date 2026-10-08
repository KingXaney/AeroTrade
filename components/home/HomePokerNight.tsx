import Link from "next/link";
import {HOME_PANEL_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {tableLine, type HomePokerNight as HomePokerNightView, type TableLink} from "@/lib/poker-night/lobby";
import {cn} from "@/lib/utils";
import {actionButton} from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// Home's poker night panel (lib/poker-night/lobby.homePokerNight; app/(root)/page.tsx streams it and
// draws it only when one of its lists has a row): the tables the reader holds a seat at — Rejoin —
// or hosts from outside a seat — Open — and friends' open tables to Join, a few of each, with the
// lobby and the Hands guide a link away. Props only: the poker night server guard keeps the stores
// out of every component, so the page reads them. Every button is a 44 px target on a phone.

const TableRows = ({tables, join}: {tables: TableLink[]; join: boolean}) => (
    <ul className="space-y-2">
        {tables.map((table) => {
            const nameId = `home-pn-${table.code}`;
            const label = table.sitting ? HOME_PANEL_COPY.rejoin : join ? HOME_PANEL_COPY.join : HOME_PANEL_COPY.open;
            return (
                <RowCard
                    as="li"
                    key={table.code}
                    tone={table.sitting ? 'selected' : 'plain'}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                    data-home-pn-table={table.code}
                >
                    <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                            <bdi id={nameId} className="truncate">{TABLE_COPY.name(table.name, table.code)}</bdi>
                            {table.sitting && <Badge tone="brand">{HOME_PANEL_COPY.seatedBadge}</Badge>}
                        </p>
                        <p className="text-xs text-fg-muted">{tableLine(table)}</p>
                    </div>
                    <Link
                        href={table.href}
                        aria-describedby={nameId}
                        className={actionButton({
                            variant: table.sitting ? 'primary' : 'secondary',
                            // 44 px on a phone either way up (an 844 px phone on its side is past sm).
                            className: 'inline-flex min-h-11 items-center justify-center lg:min-h-9',
                        })}
                        data-home-pn-go={table.sitting ? 'rejoin' : join ? 'join' : 'open'}
                    >
                        {label}
                    </Link>
                </RowCard>
            );
        })}
    </ul>
);

const HomePokerNight = ({view}: {view: HomePokerNightView}) => (
    <Panel id="home-poker-night" aria-labelledby="home-poker-night-heading" data-home-poker-night="">
        <div className="mb-4 flex items-center justify-between gap-3">
            <SectionHeading id="home-poker-night-heading" spacing="none">{HOME_PANEL_COPY.heading}</SectionHeading>
            <Link href="/poker-night" className="label-type inline-flex min-h-11 shrink-0 items-center text-xs text-brand hover:underline">{HOME_PANEL_COPY.lobby} →</Link>
        </div>
        <div className={cn('grid grid-cols-1 gap-4', view.tables !== null && view.friends !== null && 'lg:grid-cols-2')}>
            {view.tables && (
                <section aria-labelledby="home-poker-night-yours" data-home-pn-list="yours">
                    <SectionHeading as="h3" size="xs" spacing="sm" id="home-poker-night-yours">{HOME_PANEL_COPY.yours}</SectionHeading>
                    <TableRows tables={view.tables} join={false}/>
                </section>
            )}
            {view.friends && (
                <section aria-labelledby="home-poker-night-friends" data-home-pn-list="friends">
                    <SectionHeading as="h3" size="xs" spacing="sm" id="home-poker-night-friends">{HOME_PANEL_COPY.friends}</SectionHeading>
                    <TableRows tables={view.friends} join/>
                </section>
            )}
        </div>
        <Link
            href="/poker-night?tab=hands"
            className="label-type mt-3 inline-flex min-h-11 items-center text-xs text-brand hover:underline"
            data-home-pn-hands=""
        >
            {HOME_PANEL_COPY.hands} →
        </Link>
    </Panel>
);

export default HomePokerNight;
