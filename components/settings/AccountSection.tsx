'use client';

import {LogOut} from "lucide-react";
import {useSignOut} from "@/hooks/useSignOut";
import type {User} from '@/lib/auth/types';

const AccountSection = ({user}: {user: User}) => {
    const handleSignOut = useSignOut();

    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                     style={{backgroundColor: 'var(--brand-strong)', color: 'var(--on-brand)', fontFamily: 'var(--type-display)'}}>
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{user.name}</div>
                    <div className="text-xs text-fg-muted truncate" style={{fontFamily: 'var(--type-mono)'}}>{user.email}</div>
                </div>
            </div>
            <button type="button" onClick={handleSignOut}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-negative border border-line-strong/40 transition-colors"
                    style={{fontFamily: 'var(--type-mono)'}}>
                <LogOut className="size-4"/>
                Log out
            </button>
        </div>
    );
};

export default AccountSection;
