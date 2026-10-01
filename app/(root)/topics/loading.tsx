import RouteLoading from "@/components/shell/RouteLoading";

// The header matches TopicsShell's own (not PageTitle yet), so it does not reflow.
const TopicsLoading = () => (
    <RouteLoading
        header={
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1 font-heading">Topics</h1>
                <p className="text-sm text-fg-muted">Everything you follow, from every source we read</p>
            </div>
        }
        rail
        panels={4}
    />
);

export default TopicsLoading;
