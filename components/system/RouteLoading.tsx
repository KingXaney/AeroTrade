import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import WidgetSkeleton from "@/components/dashboard/WidgetSkeleton";

// Shared route skeleton. Only /topics had one before, so clicking Watchlist or Brain left
// the *previous* page fully rendered for the length of a multi-call price fan-out — the
// click read as ignored and people clicked again. Keeping the heading in the skeleton
// means the title doesn't pop in after the content.
//
// PageTitle owns the h1 here and on the real page, so the title no longer reflows the
// moment the skeleton is replaced (the two used to disagree about tracking-tight).
type Props = {
    title?: string;
    subtitle?: string;
    panels?: number;
};

const RouteLoading = ({title, subtitle, panels = 3}: Props) => (
    <div className="space-y-4">
        {title && <PageTitle title={title} subtitle={subtitle} />}
        <Panel>
            <WidgetSkeleton rows={2} height={80}/>
        </Panel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({length: panels}, (_, i) => (
                <Panel key={i} pad={4}>
                    <WidgetSkeleton rows={4} height={160}/>
                </Panel>
            ))}
        </div>
    </div>
);

export default RouteLoading;
