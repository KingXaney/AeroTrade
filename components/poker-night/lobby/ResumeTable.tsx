import Link from "next/link";
import {POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {tableLine, type TableLink} from "@/lib/poker-night/lobby";
import {actionButton} from "@/components/primitives/ActionButton";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The lobby's first card while the reader holds a seat at an open table (lib/poker-night/lobby.resumeOf,
// the newest such table): "You are seated at …", the table's line as the lobby's rows print it, and
// Rejoin. A server component; the page draws it above everything else, across both columns, and
// only when there is such a table. Its heading is the lobby panels' own (SectionHeading, the active
// style's .heading-type).
const ResumeTable = ({table}: {table: TableLink}) => (
    <Panel
        id="poker-night-resume"
        aria-labelledby="poker-night-resume-heading"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2"
        data-lobby-resume={table.code}
    >
        <div className="min-w-0 flex-1">
            <SectionHeading as="h2" id="poker-night-resume-heading" spacing="none">
                {POKER_NIGHT_COPY.resumeTitle(TABLE_COPY.name(table.name, table.code))}
            </SectionHeading>
            <p className="mt-0.5 text-xs text-fg-muted">{tableLine(table)}</p>
        </div>
        <Link
            href={table.href}
            className={actionButton({variant: 'strong', size: 'md', className: 'inline-flex min-h-11 w-full items-center justify-center sm:w-auto'})}
            data-lobby-rejoin=""
        >
            {POKER_NIGHT_COPY.rejoin}
        </Link>
    </Panel>
);

export default ResumeTable;
