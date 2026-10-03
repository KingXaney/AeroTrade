import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getPuzzleArchive} from "@/lib/games/store";
import {ARCHIVE_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL} from "@/lib/learn/copy/games";
import {cn} from "@/lib/utils";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import {rowCard} from "@/components/primitives/RowCard";

export const metadata: Metadata = {title: "Past puzzles"};

const ICON = {solved: 'check_circle', revealed: 'visibility', open: 'pending'} as const;

// Every puzzle posted so far, newest first, with how far the reader got with each.
const PuzzleArchivePage = async () => {
    const userId = await requireUserId();
    const rows = await getPuzzleArchive(userId);

    return (
        <div className="space-y-4" data-puzzle-archive>
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={ARCHIVE_COPY.title} subtitle={ARCHIVE_COPY.subtitle}/>
            {rows.length === 0 ? <EmptyState title={ARCHIVE_COPY.title} description={ARCHIVE_COPY.empty}/> : (
                <Panel>
                    <ol className="space-y-2">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <Link href={`/games/puzzles/${row.id}`} data-archive-puzzle={row.id} data-status={row.status ?? 'new'}
                                      className={rowCard({interactive: true, className: 'flex items-center gap-3'})}>
                                    <span aria-hidden="true" className={cn('material-symbols-outlined shrink-0 text-lg',
                                        row.status === 'solved' ? 'text-positive' : 'text-fg-muted')}>
                                        {row.status ? ICON[row.status] : 'radio_button_unchecked'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-fg">{PUZZLE_COPY.number(row.number)} · {row.title}</span>
                                        <MicroLabel as="span" className="block normal-case tracking-normal">
                                            {PUZZLE_CATEGORY_LABEL[row.category]} · {PUZZLE_DIFFICULTY_LABEL[row.difficulty]} · {ARCHIVE_COPY.posted(row.firstDay)}
                                        </MicroLabel>
                                    </span>
                                    <span className={cn('shrink-0 text-right font-mono text-[11px]', row.status === 'solved' ? 'text-positive' : 'text-fg-muted')}>
                                        {row.status ? ARCHIVE_COPY.status[row.status] : ARCHIVE_COPY.notTried}
                                        {row.solvedOnItsDay && <span className="block">{ARCHIVE_COPY.onItsDay}</span>}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                </Panel>
            )}
        </div>
    );
};

export default PuzzleArchivePage;
