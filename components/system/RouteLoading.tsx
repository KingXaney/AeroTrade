import WidgetSkeleton from "@/components/dashboard/WidgetSkeleton";

// Shared route skeleton. Only /topics had one before, so clicking Watchlist or Brain left
// the *previous* page fully rendered for the length of a multi-call price fan-out — the
// click read as ignored and people clicked again. Keeping the heading in the skeleton
// means the title doesn't pop in after the content.
type Props = {
    title?: string;
    subtitle?: string;
    panels?: number;
};

const RouteLoading = ({title, subtitle, panels = 3}: Props) => (
    <div className="space-y-4">
        {title && (
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                    style={{fontFamily: 'var(--type-display)'}}>
                    {title}
                </h1>
                {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
            </div>
        )}
        <div className="glass-panel rounded-xl p-5">
            <WidgetSkeleton rows={2} height={80}/>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({length: panels}, (_, i) => (
                <div key={i} className="glass-panel rounded-xl p-4">
                    <WidgetSkeleton rows={4} height={160}/>
                </div>
            ))}
        </div>
    </div>
);

export default RouteLoading;
