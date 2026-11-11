'use client';

import {useState, type ReactNode} from "react";
import {SWITCH_COPY} from "@/lib/learn/copy/portfolio";
import {useAccountSwitch} from "@/components/trading/accounts/useSwitchAccount";

// The /portfolio heading: the account's name, the line that says how its holdings are valued,
// and whatever the page hangs under it (who trades the account). While another account is being
// opened it already names that one, and the line says so in place of the old account's figures —
// a new name over the old numbers would read as the new account's. When the page has arrived,
// a polite line tells a screen reader which account is shown.
const AccountHeading = ({accounts, activeId, summaryLine, children}: {
    accounts: readonly {id: string; name: string}[];
    activeId: string;
    summaryLine: string;
    children?: ReactNode;
}) => {
    const {shownId, pending} = useAccountSwitch(activeId);
    const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';
    const name = nameOf(shownId) || nameOf(activeId);

    // Announced only after a switch, never on the first load (the h1 already says it).
    const [seen, setSeen] = useState(activeId);
    const [arrived, setArrived] = useState('');
    if (seen !== activeId) {
        setSeen(activeId);
        setArrived(SWITCH_COPY.showing(nameOf(activeId)));
    }

    return (
        <div>
            <h1 className="text-2xl font-semibold text-fg mb-1 font-heading" data-account-heading={shownId}>
                {name}
            </h1>
            {pending
                ? <p className="text-sm text-fg-muted" role="status" data-account-opening>{SWITCH_COPY.opening(name)}</p>
                : <p className="text-sm text-fg-muted" data-account-basis>{summaryLine}</p>}
            {/* The old account's own line keeps its room while pending, unseen and unread, so
                the page does not jump at the click; it is the new account's once the page arrives. */}
            <div className={pending ? 'invisible' : undefined} aria-hidden={pending || undefined}>{children}</div>
            <p className="sr-only" aria-live="polite">{arrived}</p>
        </div>
    );
};

export default AccountHeading;
