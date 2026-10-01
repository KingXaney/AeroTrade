import {accountExportHref} from "@/lib/trading/csv";
import {actionButton} from "@/components/primitives/ActionButton";

// Plain download link styled like the other header buttons — the route handler
// streams the account's full trade history as CSV.
const ExportCsvButton = ({accountId}: {accountId: string}) => (
    <a
        href={accountExportHref(accountId)}
        download
        className={actionButton({variant: 'secondary', className: 'inline-flex items-center gap-2 tracking-wider hover:text-brand'})}
    >
        <span className="material-symbols-outlined text-base">download</span>
        Export CSV
    </a>
);

export default ExportCsvButton;
