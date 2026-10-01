import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import WidgetSkeleton from "@/components/primitives/Skeleton";

// Shared route skeleton. Only /topics had one before, so clicking Watchlist or Brain left
// the *previous* page fully rendered for the length of a multi-call price fan-out — the
// click read as ignored and people clicked again. Keeping the heading in the skeleton
// means the title doesn't pop in after the content.
//
// PageTitle owns the h1 here and on the real page, so the title no longer reflows the
// moment the skeleton is replaced (the two used to disagree about tracking-tight).
// A page whose header is not PageTitle yet (/news, /topics) passes its own as `header`,
// for the same reason.
type Props = {
    title?: string;
    subtitle?: string;
    header?: ReactNode;
    panels?: number;
    // Row height of the wide skeleton above the grid.
    lead?: number;
    // Breakpoint columns of the panel grid (it is one column below them).
    columns?: string;
    // The /topics layout: a left rail beside the content.
    rail?: boolean;
};

const RouteLoading = ({title, subtitle, header, panels = 3, lead = 80, columns = 'md:grid-cols-2', rail}: Props) => {
    const body = (
        <>
            <Panel>
                <WidgetSkeleton rows={2} height={lead}/>
            </Panel>
            <div className={cn('grid grid-cols-1 gap-4', columns)}>
                {Array.from({length: panels}, (_, i) => (
                    <Panel key={i} pad={4}>
                        <WidgetSkeleton rows={4} height={160}/>
                    </Panel>
                ))}
            </div>
        </>
    );

    return (
        <div className="space-y-4">
            {header ?? (title && <PageTitle title={title} subtitle={subtitle} />)}
            {rail ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <Panel pad={4} className="lg:col-span-3">
                        <WidgetSkeleton rows={5} height={160}/>
                    </Panel>
                    <div className="lg:col-span-9 space-y-4">{body}</div>
                </div>
            ) : body}
        </div>
    );
};

export default RouteLoading;
