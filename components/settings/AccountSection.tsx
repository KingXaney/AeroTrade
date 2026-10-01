'use client';

import {LogOut} from "lucide-react";
import {useSignOut} from "@/components/shell/useSignOut";
import type {User} from '@/lib/auth/types';
import ActionButton from "@/components/primitives/ActionButton";

const AccountSection = ({user}: {user: User}) => {
    const handleSignOut = useSignOut();

    return (
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
                Log out
            </ActionButton>
        </div>
    );
};

export default AccountSection;
