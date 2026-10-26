'use client';

import {useState, useTransition} from "react";
import {toast} from "sonner";
import {runWithToast} from "@/lib/action-toast";
import {linkBrokerAccount, setBrokerPaused, syncBrokerNow, unlinkBroker} from "@/lib/actions/broker.actions";
import {BROKER_COPY} from "@/lib/learn/copy/broker";
import ActionButton from "@/components/primitives/ActionButton";
import {fieldClass} from "@/components/primitives/TextField";

// The Broker section's controls: which paper account the Alpaca account mirrors, and — once one
// is — Sync now, Pause or Resume, and Unlink. Each is a server action; its outcome is toasted and
// the page re-renders from the action's own revalidation.
type Props = {
    accounts: {id: string; name: string; tradedBy: string | null}[];
    link: {sourceAccountId: string; status: 'active' | 'paused'} | null;
    connected: boolean;
};

const BrokerControls = ({accounts, link, connected}: Props) => {
    const [accountId, setAccountId] = useState(link?.sourceAccountId ?? accounts[0]?.id ?? '');
    const [busy, start] = useTransition();
    const run = (action: () => ReturnType<typeof syncBrokerNow>) => start(async () => {
        await runWithToast(action, toast, {success: '', error: BROKER_COPY.notSaved});
    });

    if (accounts.length === 0) return <p className="text-sm text-fg-muted">{BROKER_COPY.noAccounts}</p>;
    const linkedHere = link?.sourceAccountId === accountId;
    return (
        <div className="space-y-3" data-broker-controls>
            <label className="flex flex-wrap items-center gap-2 text-sm text-fg">
                {BROKER_COPY.selectLabel}
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={fieldClass('min-w-56')} data-broker-account>
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.tradedBy ? `${account.name} — ${BROKER_COPY.tradedBy(account.tradedBy)}` : account.name}
                        </option>
                    ))}
                </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
                {!linkedHere && (
                    <ActionButton variant="primary" size="sm" disabled={busy || !accountId} onClick={() => run(() => linkBrokerAccount({accountId}))} data-broker-link>
                        {link ? BROKER_COPY.relinkButton : BROKER_COPY.linkButton}
                    </ActionButton>
                )}
                {link && (
                    <>
                        <ActionButton variant="primary" size="sm" disabled={busy || !connected} onClick={() => run(syncBrokerNow)} data-broker-sync>{BROKER_COPY.syncNow}</ActionButton>
                        <ActionButton variant="secondary" size="sm" disabled={busy} onClick={() => run(() => setBrokerPaused({paused: link.status === 'active'}))} data-broker-pause>
                            {link.status === 'active' ? BROKER_COPY.pause : BROKER_COPY.resume}
                        </ActionButton>
                        <ActionButton variant="danger" size="sm" disabled={busy} onClick={() => run(unlinkBroker)} data-broker-unlink>{BROKER_COPY.unlink}</ActionButton>
                    </>
                )}
            </div>
            {link && <p className="text-xs text-fg-muted">{BROKER_COPY.unlinkNote}</p>}
        </div>
    );
};

export default BrokerControls;
