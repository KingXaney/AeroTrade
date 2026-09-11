import WidgetSkeleton from "@/components/dashboard/WidgetSkeleton";

const TopicsLoading = () => (
    <div className="space-y-4">
        <div className="mb-2">
            <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>Topics</h1>
            <p className="text-sm text-fg-muted">Everything you follow, from every source we read</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-3 glass-panel rounded-xl p-4"><WidgetSkeleton rows={5} height={160} /></div>
            <div className="lg:col-span-9 space-y-4">
                <div className="glass-panel rounded-xl p-5"><WidgetSkeleton rows={2} height={80} /></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({length: 4}, (_, i) => (
                        <div key={i} className="glass-panel rounded-xl p-4"><WidgetSkeleton rows={4} height={160} /></div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

export default TopicsLoading;
