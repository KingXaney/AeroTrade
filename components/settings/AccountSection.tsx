'use client';

import {useState, type FormEvent} from "react";
import {LogOut} from "lucide-react";
import {toast} from "sonner";
import {useSignOut} from "@/components/shell/useSignOut";
import type {User} from '@/lib/auth/types';
import {changeMyPassword, deleteMyAccount} from "@/lib/actions/account.actions";
import {runWithToast} from "@/lib/action-toast";
import {confirmsDeletion} from "@/lib/account/limits";
import {MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH} from "@/lib/auth/validation";
import {ACCOUNT_COPY} from "@/lib/learn/copy/account";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

// Changing the password: the current one, then the new one. The server checks both again and
// signs every other device out (lib/actions/account.actions.changeMyPassword).
const ChangePassword = () => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [working, setWorking] = useState(false);
    const ready = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && next.length <= MAX_PASSWORD_LENGTH;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (working || !ready) return;
        setWorking(true);
        const done = await runWithToast(() => changeMyPassword({currentPassword: current, newPassword: next}), toast, {
            success: ACCOUNT_COPY.password.done, error: ACCOUNT_COPY.password.failed,
        });
        setWorking(false);
        if (done) {
            setCurrent('');
            setNext('');
        }
    };

    return (
        <form onSubmit={submit} className="space-y-3" data-account-password>
            <SectionHeading>{ACCOUNT_COPY.password.heading}</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <MicroLabel as="label" htmlFor="account-current-password">{ACCOUNT_COPY.password.current}</MicroLabel>
                    <TextField id="account-current-password" type="password" autoComplete="current-password" value={current}
                        onChange={(e) => setCurrent(e.target.value)} maxLength={MAX_PASSWORD_LENGTH} className="w-full mt-1" />
                </div>
                <div>
                    <MicroLabel as="label" htmlFor="account-new-password">{ACCOUNT_COPY.password.next}</MicroLabel>
                    <TextField id="account-new-password" type="password" autoComplete="new-password" value={next}
                        onChange={(e) => setNext(e.target.value)} maxLength={MAX_PASSWORD_LENGTH} aria-describedby="account-new-password-hint" className="w-full mt-1" />
                    <p id="account-new-password-hint" className="mt-1 text-xs text-fg-muted">{ACCOUNT_COPY.password.nextHint}</p>
                </div>
            </div>
            <ActionButton type="submit" variant="secondary" disabled={working || !ready}>
                {working ? ACCOUNT_COPY.password.working : ACCOUNT_COPY.password.submit}
            </ActionButton>
        </form>
    );
};

// Deleting the account: the dialog says what goes, and asks for the account's address and its
// password. Once the server has deleted it the session is gone, so the page is left by a full
// load, which lands on the front door.
const DeleteAccount = ({email}: {email: string}) => {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [password, setPassword] = useState('');
    const [working, setWorking] = useState(false);
    const ready = confirmsDeletion(typed, email) && password.length > 0;

    const close = (nextOpen: boolean) => {
        if (working) return;
        setOpen(nextOpen);
        if (!nextOpen) {
            setTyped('');
            setPassword('');
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (working || !ready) return;
        setWorking(true);
        const done = await runWithToast(() => deleteMyAccount({password, confirm: typed}), toast, {
            success: ACCOUNT_COPY.remove.done, error: ACCOUNT_COPY.remove.failed,
        });
        if (done) {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load on purpose: the session is gone, and every cached layout with it
            window.location.assign('/');
            return;
        }
        setWorking(false);
    };

    return (
        <div className="space-y-3" data-account-delete>
            <SectionHeading>{ACCOUNT_COPY.remove.heading}</SectionHeading>
            <ActionButton type="button" variant="danger" onClick={() => setOpen(true)} data-account-delete-open>
                {ACCOUNT_COPY.remove.open}
            </ActionButton>
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{ACCOUNT_COPY.remove.title}</DialogTitle>
                        <DialogDescription>{ACCOUNT_COPY.remove.body}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-3">
                        <div>
                            <MicroLabel as="label" htmlFor="account-delete-confirm">{ACCOUNT_COPY.remove.confirmLabel(email)}</MicroLabel>
                            <TextField id="account-delete-confirm" type="email" autoComplete="off" value={typed}
                                onChange={(e) => setTyped(e.target.value)} className="w-full mt-1" />
                        </div>
                        <div>
                            <MicroLabel as="label" htmlFor="account-delete-password">{ACCOUNT_COPY.remove.passwordLabel}</MicroLabel>
                            <TextField id="account-delete-password" type="password" autoComplete="current-password" value={password}
                                onChange={(e) => setPassword(e.target.value)} maxLength={MAX_PASSWORD_LENGTH} className="w-full mt-1" />
                        </div>
                        <ActionButton type="submit" variant="destructive" size="block" disabled={working || !ready} data-account-delete-confirm>
                            {working ? ACCOUNT_COPY.remove.working : ACCOUNT_COPY.remove.submit}
                        </ActionButton>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const AccountSection = ({user}: {user: User}) => {
    const handleSignOut = useSignOut();

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0 font-heading bg-brand-strong text-on-brand">
                        {user.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-fg truncate font-heading">{user.name}</div>
                        <div className="text-xs text-fg-muted truncate font-mono">{user.email}</div>
                    </div>
                </div>
                <ActionButton variant="danger" onClick={handleSignOut} className="inline-flex items-center gap-2">
                    <LogOut className="size-4"/>
                    {ACCOUNT_COPY.logOut}
                </ActionButton>
            </div>
            <ChangePassword />
            <DeleteAccount email={user.email} />
        </div>
    );
};

export default AccountSection;
