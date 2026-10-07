import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import {getCultureBrandsView, getCulturePicksView, getCultureSystemView} from "@/lib/culture/page-store";
import BrandBoard from "@/components/culture/BrandBoard";
import BrandEvidence from "@/components/culture/BrandEvidence";
import CultureLegend from "@/components/culture/CultureLegend";
import CultureSystem from "@/components/culture/CultureSystem";
import PickerColumn from "@/components/culture/PickerColumn";
import PickerComparison from "@/components/culture/PickerComparison";
import RisingBrands from "@/components/culture/RisingBrands";
import SuggestedBrands from "@/components/culture/SuggestedBrands";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import SectionHeading from "@/components/primitives/SectionHeading";
import Tabs from "@/components/primitives/Tabs";
import {CULTURE_COPY, CULTURE_PICKS_COPY} from "@/lib/learn/copy/culture";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Culture Brain"};

// Three views, one at a time in the URL, each reading only its own data:
//   brands — what younger consumers are giving attention to (the board, the rising list, a
//            brand's evidence)
//   picks  — what the two pickers did about it, side by side (records, decisions, holdings)
//   system — whether the machinery ran (counters, freshness, the jobs' stamps, suggestions)
// Every read is global: the brain and its accounts belong to no reader, so the session is only
// the gate. The page composes lib/culture/page-store's reads and nothing else.
const VIEW_IDS = ['brands', 'picks', 'system'] as const;
type ViewId = (typeof VIEW_IDS)[number];
const isView = (value: unknown): value is ViewId => typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value);

const TABS = VIEW_IDS.map((id) => ({id, label: CULTURE_COPY.views[id], href: id === 'brands' ? '/culture' : `/culture?view=${id}`}));

type CulturePageProps = {
    searchParams: Promise<{brand?: string; view?: string}>;
};

const BrandsView = async ({brandId}: {brandId: string | null}) => {
    const view = await getCultureBrandsView(brandId);
    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Panel id="brand-board" className="xl:col-span-2">
                    <SectionHeading>{CULTURE_COPY.boardHeading}</SectionHeading>
                    <BrandBoard groups={view.groups} marks={view.marks} thesisThreshold={view.thesisThreshold} unpricedWeek={view.unpricedWeek} />
                </Panel>
                <Panel id="rising-brands">
                    <SectionHeading>{CULTURE_COPY.risingHeading}</SectionHeading>
                    <RisingBrands rows={view.rising} />
                </Panel>
            </div>

            {/* Evidence drill-down for ?brand= */}
            {view.evidence && (
                <Panel id="evidence" className="scroll-mt-24">
                    <SectionHeading>{CULTURE_COPY.evidenceHeading}</SectionHeading>
                    <BrandEvidence brand={view.evidence.brand} items={view.evidence.items} days={view.evidence.days} />
                </Panel>
            )}
        </>
    );
};

const PicksView = async () => {
    const view = await getCulturePicksView();
    return (
        <>
            <PickerComparison rows={view.comparison} simulated={view.backtest} />
            <p className="text-sm text-fg-soft max-w-3xl" data-picks-lead>{CULTURE_PICKS_COPY.lead}</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                {view.pickers.map((picker) => <PickerColumn key={picker.id} picker={picker} />)}
            </div>
        </>
    );
};

// Is the machinery actually running?
const SystemView = async () => {
    const view = await getCultureSystemView();
    return (
        <>
            <CultureSystem view={view} />
            <Panel id="suggested-brands">
                <SectionHeading>{CULTURE_COPY.suggestionsHeading}</SectionHeading>
                <SuggestedBrands rows={view.suggestions} />
            </Panel>
        </>
    );
};

const CulturePage = async ({searchParams}: CulturePageProps) => {
    await requireUserId();

    const {brand, view: viewParam} = await searchParams;
    // An evidence link (?brand=) always means the brands view, whatever else the URL says.
    const view: ViewId = !brand && isView(viewParam) ? viewParam : 'brands';

    return (
        <div className="space-y-4">
            <PageTitle title="Culture Brain" subtitle={CULTURE_COPY.pageSubtitle} />
            <Tabs tabs={TABS} active={view} label="Culture Brain views" />

            {view === 'brands' && <BrandsView brandId={brand ?? null} />}
            {view === 'picks' && <PicksView />}
            {view === 'system' && <SystemView />}

            {/* How attention is built and scored: reference for every view, collapsed. */}
            <CultureLegend />
        </div>
    );
};

export default CulturePage;
