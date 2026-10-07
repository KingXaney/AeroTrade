'use client';

import Link from "next/link";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {LogOut, ChevronDown, Settings, Users} from "lucide-react";
import {useSignOut} from "@/components/shell/useSignOut";
import type {User} from '@/lib/auth/types';

// The account menu: the pages about the person (Friends, Settings) and Log out. A pending
// friend request shows as a dot on the avatar — it used to be a badge on a sidebar row, and an
// ask nobody can see leaves both sides waiting.
function UserDropdown({user, friendRequests = 0}: {user: User; friendRequests?: number}) {
    const handleSignOut = useSignOut();

    const initial = user.name?.[0]?.toUpperCase() ?? '?';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={friendRequests > 0 ? `Account menu, ${friendRequests} pending friend ${friendRequests === 1 ? 'request' : 'requests'}` : 'Account menu'}
                    className="group relative inline-flex items-center gap-3 rounded-full px-2 py-1.5 text-fg-soft hover:bg-surface-3/60 hover:text-fg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
                >
                    {friendRequests > 0 && (
                        <span aria-hidden="true" data-friend-requests={friendRequests}
                              className="absolute left-8 top-1 z-10 size-2.5 rounded-full bg-brand outline-2 outline-chrome"/>
                    )}
                    <Avatar className="h-9 w-9 ring-1 ring-line-strong group-hover:ring-brand-strong transition-all">
                        <AvatarFallback
                            className="text-sm font-bold font-heading bg-brand-strong text-on-brand"
                        >
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    {/* Search takes the bar's middle, so the name shows only where there is room for both. */}
                    <div className="hidden xl:flex flex-col items-start leading-tight whitespace-nowrap" data-user-name>
                        <span className="text-sm font-medium text-fg font-heading">
                            {user.name}
                        </span>
                        <span className="text-[10px] text-fg-muted font-mono"
                              style={{ letterSpacing: '0.02em' }}>
                            Paper trading
                        </span>
                    </div>
                    <ChevronDown className="hidden sm:block size-4 text-fg-muted group-hover:text-fg-soft transition-transform group-data-[state=open]:rotate-180"/>
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={10}
                className="w-64 !p-2 text-fg"
            >
                {/* Profile card */}
                <DropdownMenuLabel className="!p-0">
                    <div className="flex items-center gap-3 rounded-md p-3 bg-surface-2/50">
                        <Avatar className="h-11 w-11 ring-1 ring-line-strong">
                                <AvatarFallback
                                className="text-base font-bold font-heading bg-brand-strong text-on-brand"
                            >
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-fg truncate font-heading">
                                {user.name}
                            </span>
                            <span className="text-xs text-fg-muted truncate font-mono">
                                {user.email}
                            </span>
                        </div>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-surface-2" style={{ margin: '8px 0' }}/>

                <DropdownMenuItem asChild className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-brand-strong/8 focus:!text-brand transition-colors">
                    <Link href="/friends">
                        <Users className="size-4 text-fg-soft group-focus:text-brand transition-colors"/>
                        Friends
                        {friendRequests > 0 && (
                            <span className="ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] text-brand"
                                  aria-label={`${friendRequests} pending friend ${friendRequests === 1 ? 'request' : 'requests'}`}>{friendRequests}</span>
                        )}
                    </Link>
                </DropdownMenuItem>

                {/* Themes, dashboard layout and notification preferences live in Settings */}
                <DropdownMenuItem asChild className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-brand-strong/8 focus:!text-brand transition-colors">
                    <Link href="/settings">
                        <Settings className="size-4 text-fg-soft group-focus:text-brand transition-colors"/>
                        Settings
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-surface-2" style={{ margin: '8px 0' }}/>

                {/* Logout — destructive intent */}
                <DropdownMenuItem
                    onClick={handleSignOut}
                    className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-negative/10 focus:!text-negative transition-colors"
                >
                    <LogOut className="size-4 text-fg-soft group-focus:text-negative transition-colors"/>
                    Log out
                </DropdownMenuItem>

            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default UserDropdown;
