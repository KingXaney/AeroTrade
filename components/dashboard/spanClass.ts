import type {WidgetSpan} from "@/lib/dashboard/catalog";

// Literal class strings so the Tailwind scanner sees them — never build col-span-${n} at runtime.
// Reproduces today's breakpoints: one column <md, three 4-span cards from md, 12 columns at xl.
const SPAN_CLASS: Record<WidgetSpan, string> = {
    3: 'md:col-span-6 xl:col-span-3',
    4: 'md:col-span-4',
    6: 'md:col-span-6',
    8: 'md:col-span-12 xl:col-span-8',
    12: 'md:col-span-12',
};

// Iframes and charts need the full row below xl.
const WIDE_TABLET_SPAN_CLASS: Record<WidgetSpan, string> = {
    3: 'md:col-span-12 xl:col-span-3',
    4: 'md:col-span-12 xl:col-span-4',
    6: 'md:col-span-12 xl:col-span-6',
    8: 'md:col-span-12 xl:col-span-8',
    12: 'md:col-span-12',
};

export const spanClass = (span: WidgetSpan, wideOnTablet: boolean): string =>
    (wideOnTablet ? WIDE_TABLET_SPAN_CLASS : SPAN_CLASS)[span];
