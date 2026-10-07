import Link from "next/link";
import {actionButton} from "@/components/primitives/ActionButton";
import EmptyState from "@/components/primitives/EmptyState";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";

// An unknown, malformed or expired table code: the [code] layout's notFound(), thrown before anything
// streams so the answer is a real 404, and caught here, by the parent segment (the page's own
// notFound() lands here too). A well-formed code that names no table has spent the address's miss
// counter on its way here (lib/poker-night/page-gate), as on the table routes, and an address past
// that counter lands here for every code, so this page says nothing about which codes exist.
const TableNotFound = () => (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center p-4">
        <EmptyState
            size="panel"
            icon="search_off"
            className="w-full"
            title={TABLE_COPY.notFoundTitle}
            description={TABLE_COPY.notFound}
            action={
                <Link href="/poker-night" className={actionButton({size: 'md'})}>
                    {TABLE_COPY.toLobby}
                </Link>
            }
        />
    </main>
);

export default TableNotFound;
