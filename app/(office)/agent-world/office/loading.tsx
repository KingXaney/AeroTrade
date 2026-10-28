import Panel from "@/components/primitives/Panel";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import {OFFICE_COPY} from "@/lib/learn/copy/agent-world-office";

// What the office shows while the page reads the session: the floor's outline and a few lines, in
// a Panel, with the one sentence that says what is happening.
const OfficeLoading = () => (
    <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
        <Panel className="w-full max-w-xl space-y-4" aria-label={OFFICE_COPY.loading}>
            <div className="mx-auto aspect-[5/3] w-full max-w-md animate-pulse rounded-xl bg-surface-3" aria-hidden="true" />
            <p className="text-center text-sm text-fg-muted">{OFFICE_COPY.loading}</p>
            <WidgetSkeleton height={48} rows={2} />
        </Panel>
    </main>
);

export default OfficeLoading;
