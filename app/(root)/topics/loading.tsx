import WidgetSkeleton from "@/components/primitives/Skeleton";
import Panel from "@/components/primitives/Panel";

const TopicsLoading = () => (
    <div className="space-y-4">
        <div className="mb-2">
            <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>Topics</h1>
            <p className="text-sm text-fg-muted">Everything you follow, from every source we read</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <Panel as="div" pad={4} className="lg:col-span-3"><WidgetSkeleton rows={5} height={160} /></Panel>
            <div className="lg:col-span-9 space-y-4">
                <Panel as="div"><WidgetSkeleton rows={2} height={80} /></Panel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({length: 4}, (_, i) => (
                        <Panel as="div" pad={4} key={i}><WidgetSkeleton rows={4} height={160} /></Panel>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

export default TopicsLoading;
