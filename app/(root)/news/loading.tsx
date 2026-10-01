import WidgetSkeleton from "@/components/primitives/Skeleton";
import Panel from "@/components/primitives/Panel";

const NewsLoading = () => (
    <div className="space-y-4">
        <div className="mb-2">
            <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>News</h1>
            <p className="text-sm text-fg-muted">Loading your feed…</p>
        </div>
        <Panel as="div"><WidgetSkeleton rows={2} height={72} /></Panel>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({length: 6}, (_, i) => (
                <Panel as="div" pad={4} key={i}><WidgetSkeleton rows={4} height={160} /></Panel>
            ))}
        </div>
    </div>
);

export default NewsLoading;
