import {accountExportHref} from "@/lib/trading/csv";

// Plain download link styled like the other header buttons — the route handler
// streams the account's full trade history as CSV.
const ExportCsvButton = ({accountId}: {accountId: string}) => (
    <a
        href={accountExportHref(accountId)}
        download
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-soft hover:text-brand transition-colors"
        style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
    >
        <span className="material-symbols-outlined text-base">download</span>
        Export CSV
    </a>
);

export default ExportCsvButton;
