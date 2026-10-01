import RouteLoading from "@/components/shell/RouteLoading";

// The header matches news/page.tsx's own (not PageTitle yet), so it does not reflow.
const NewsLoading = () => (
    <RouteLoading
        header={
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>News</h1>
                <p className="text-sm text-fg-muted">Loading your feed…</p>
            </div>
        }
        lead={72}
        panels={6}
        columns="md:grid-cols-2 xl:grid-cols-3"
    />
);

export default NewsLoading;
