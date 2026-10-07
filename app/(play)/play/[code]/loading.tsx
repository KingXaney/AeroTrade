import Panel from "@/components/primitives/Panel";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";

// What the table shows while the page reads the room: the felt's outline and a few lines, in a
// Panel, with the one sentence that says what is happening.
const TableSkeleton = () => (
    <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
        <Panel className="w-full max-w-xl space-y-4" aria-label={TABLE_COPY.loading}>
            <div className="mx-auto aspect-[2/1] w-full max-w-md animate-pulse rounded-full bg-surface-3" aria-hidden="true"/>
            <p className="text-center text-sm text-fg-muted">{TABLE_COPY.loading}</p>
            <WidgetSkeleton height={64} rows={2}/>
        </Panel>
    </main>
);

export default TableSkeleton;
