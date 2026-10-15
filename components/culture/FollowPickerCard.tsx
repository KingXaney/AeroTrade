'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {enrollCulturePicker, pauseCultureFollow, resumeCultureFollow, runCultureFollowNow, unenrollCulturePicker} from "@/lib/actions/culture.actions";
import {PAPER_STARTING_BALANCE, STARTING_BALANCE_RANGE, resolveStartingBalance} from "@/lib/trading/starting-balance";
import {runWithToast} from "@/lib/action-toast";
import type {ActionResult} from '@/lib/actions/types';
import type {FollowProfile, FollowStatus} from '@/lib/culture/follow';
import Panel from '@/components/primitives/Panel';
import ActionButton from '@/components/primitives/ActionButton';
import TextField from '@/components/primitives/TextField';
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import {CULTURE_FOLLOW_COPY as COPY} from "@/lib/learn/copy/culture";

// Enrolment and kill switch for an account of the reader's that a culture picker trades: the
// Navigator card's shape (components/navigator/NavigatorCard), one per picker. The actions are
// the only server calls; the card holds only its own busy state and the balance being typed.
type Props = {
    profile: FollowProfile;
    label: string;
    status: FollowStatus;
    accountName: string;
    pickerPaused: boolean;
};

const FollowPickerCard = ({profile, label, status, accountName, pickerPaused}: Props) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
    const [startBalance, setStartBalance] = useState(String(PAPER_STARTING_BALANCE));

    const balanceNum = startBalance === '' ? 0 : parseInt(startBalance, 10);
    const balanceValid = resolveStartingBalance(balanceNum) !== null;
    const active = status.status === 'active';

    const run = async (action: () => Promise<ActionResult>) => {
        if (busy) return;
        setBusy(true);
        try {
            if (await runWithToast(action, toast, {success: 'Done', error: 'Something went wrong'})) {
                router.refresh();
            }
        } finally {
            setBusy(false);
            setConfirmingUnenroll(false);
        }
    };

    return (
        <Panel as="div" data-follow-card={profile}>
            <div className="flex items-center justify-between mb-3 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-brand">person_add</span>
                    <SectionHeading spacing="none">{COPY.heading(label)}</SectionHeading>
                </div>
                {status.enrolled && (
                    <span
                        className={`control-type text-[10px] px-2 py-1 rounded ${active ? 'text-brand bg-brand-strong/8' : 'text-negative bg-negative/8'}`}
                        data-follow-status={status.status}
                    >
                        {active ? COPY.active : COPY.paused}
                    </span>
                )}
            </div>

            <p className="text-sm text-fg-muted mb-4">{COPY.about(label)}</p>

            {!status.enrolled ? (
                <div className="flex flex-col gap-3">
                    <div>
                        <MicroLabel as="label" htmlFor={`follow-balance-${profile}`}>{COPY.balanceLabel(label)}</MicroLabel>
                        <TextField
                            id={`follow-balance-${profile}`}
                            value={startBalance}
                            onChange={(e) => setStartBalance(e.target.value.replace(/[^0-9]/g, ''))}
                            inputMode="numeric"
                            autoComplete="off"
                            className="w-full mt-1"
                        />
                        {!balanceValid && startBalance !== '' && (
                            <p className="mt-1 text-xs text-negative">Between {STARTING_BALANCE_RANGE}</p>
                        )}
                    </div>
                    <ActionButton
                        variant="strong"
                        size="block"
                        glow
                        data-follow-enroll
                        onClick={() => void run(() => enrollCulturePicker({profile, startingBalance: balanceNum}))}
                        disabled={busy || !balanceValid}
                    >
                        {busy ? COPY.enrolling : COPY.enroll(label, `$${(balanceNum || 0).toLocaleString('en-US')}`)}
                    </ActionButton>
                </div>
            ) : (
                <>
                    {status.enrolledAt !== undefined && (
                        <MicroLabel as="p" className="mb-3" data-follow-account>
                            {COPY.accountLine(accountName, new Date(status.enrolledAt).toLocaleDateString('en-CA', {timeZone: 'America/New_York'}))}
                        </MicroLabel>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        {active && (
                            <ActionButton variant="strong" data-follow-run onClick={() => void run(() => runCultureFollowNow({profile}))} disabled={busy}>
                                {busy ? COPY.queueing : COPY.tradeNow}
                            </ActionButton>
                        )}
                        {active ? (
                            <ActionButton variant="danger" data-follow-pause onClick={() => void run(() => pauseCultureFollow({profile}))} disabled={busy} className="tracking-wider">
                                {COPY.pause}
                            </ActionButton>
                        ) : (
                            <button type="button" data-follow-resume onClick={() => void run(() => resumeCultureFollow({profile}))} disabled={busy}
                                    className="control-type px-3 py-2 rounded-lg text-xs text-brand transition-colors disabled:opacity-50 border border-brand/35">
                                {COPY.resume}
                            </button>
                        )}
                        {status.accountId && (
                            <Link href={`/portfolio?account=${status.accountId}`} data-follow-view
                                  className="control-type px-3 py-2 rounded-lg text-xs text-brand hover:underline">
                                {COPY.view}
                            </Link>
                        )}
                        <button type="button"
                                data-follow-unenroll
                                onClick={() => confirmingUnenroll ? void run(() => unenrollCulturePicker({profile})) : setConfirmingUnenroll(true)}
                                onBlur={() => setConfirmingUnenroll(false)}
                                disabled={busy}
                                className="control-type ml-auto px-3 py-2 rounded-lg text-xs text-fg-muted hover:text-negative transition-colors disabled:opacity-50">
                            {confirmingUnenroll ? COPY.confirmUnenroll : COPY.unenroll}
                        </button>
                    </div>
                    {pickerPaused && <p className="mt-3 text-xs text-fg-muted" data-follow-picker-paused>{COPY.pickerPaused(label)}</p>}
                </>
            )}
            {status.lastError && (
                <p className="mt-3 text-xs text-negative font-mono" data-follow-error>{COPY.lastError(status.lastError)}</p>
            )}
        </Panel>
    );
};

export default FollowPickerCard;
