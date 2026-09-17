import WidgetSkeleton from "@/components/dashboard/WidgetSkeleton";

const NewsLoading = () => (
    <div className="space-y-4">
        <div className="mb-2">
            <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>News</h1>
            <p className="text-sm text-fg-muted">Loading your feed…</p>
        </div>
        <div className="glass-panel rounded-xl p-5"><WidgetSkeleton rows={2} height={72} /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({length: 6}, (_, i) => (
                <div key={i} className="glass-panel rounded-xl p-4"><WidgetSkeleton rows={4} height={160} /></div>
            ))}
        </div>
    </div>
);

export default NewsLoading;
