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

import {useRouter} from "next/navigation";
import {LogOut, ChevronDown, Newspaper, Settings} from "lucide-react";
import {signOut} from "@/lib/actions/auth.actions";

// No longer needs the stock/topic lists: it used to render a duplicate NavItems for
// mobile, which the hamburger drawer replaces.
function UserDropdown({user}: {user: User}) {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push("/sign-in");
    };

    const initial = user.name?.[0]?.toUpperCase() ?? '?';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="group inline-flex items-center gap-3 rounded-full px-2 py-1.5 text-fg-soft hover:bg-surface-3/60 hover:text-fg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
                >
                    <Avatar className="h-9 w-9 ring-1 ring-line-strong group-hover:ring-brand-strong transition-all">
                        <AvatarFallback
                            className="text-sm font-bold"
                            style={{
                                backgroundColor: 'var(--brand-strong)',
                                color: 'var(--on-brand)',
                                fontFamily: 'var(--type-display)',
                            }}
                        >
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium text-fg"
                              style={{ fontFamily: 'var(--type-display)' }}>
                            {user.name}
                        </span>
                        <span className="text-[10px] text-fg-muted"
                              style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                            Paper trading
                        </span>
                    </div>
                    <ChevronDown className="hidden md:block size-4 text-fg-muted group-hover:text-fg-soft transition-transform group-data-[state=open]:rotate-180"/>
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={10}
                className="w-64 !shadow-2xl !p-2"
                style={{
                    backgroundColor: 'color-mix(in srgb, var(--chrome) 95%, transparent)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)',
                    color: 'var(--fg)',
                }}
            >
                {/* Profile card */}
                <DropdownMenuLabel className="!p-0">
                    <div className="flex items-center gap-3 rounded-md p-3"
                         style={{ backgroundColor: 'color-mix(in srgb, var(--surface-2) 50%, transparent)' }}>
                        <Avatar className="h-11 w-11 ring-1 ring-line-strong">
                                <AvatarFallback
                                className="text-base font-bold"
                                style={{ backgroundColor: 'var(--brand-strong)', color: 'var(--on-brand)', fontFamily: 'var(--type-display)' }}
                            >
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-fg truncate"
                                  style={{ fontFamily: 'var(--type-display)' }}>
                                {user.name}
                            </span>
                            <span className="text-xs text-fg-muted truncate"
                                  style={{ fontFamily: 'var(--type-mono)' }}>
                                {user.email}
                            </span>
                        </div>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator style={{ backgroundColor: 'var(--surface-2)', margin: '8px 0' }}/>

                <DropdownMenuItem asChild className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-brand-strong/8 focus:!text-brand transition-colors">
                    <Link href="/topics">
                        <Newspaper className="size-4 text-fg-soft group-focus:text-brand transition-colors"/>
                        My topics
                    </Link>
                </DropdownMenuItem>

                {/* Themes, dashboard layout and notification preferences live in Settings */}
                <DropdownMenuItem asChild className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-brand-strong/8 focus:!text-brand transition-colors">
                    <Link href="/settings">
                        <Settings className="size-4 text-fg-soft group-focus:text-brand transition-colors"/>
                        Settings
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator style={{ backgroundColor: 'var(--surface-2)', margin: '8px 0' }}/>

                {/* Logout — destructive intent */}
                <DropdownMenuItem
                    onClick={handleSignOut}
                    className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-fg focus:!bg-negative/10 focus:!text-negative transition-colors"
                >
                    <LogOut className="size-4 text-fg-soft group-focus:text-negative transition-colors"/>
                    Log out
                </DropdownMenuItem>

                {/* The mobile nav lives in the hamburger drawer now. This block used to
                    render NavItems here, which made the gap look covered while showing
                    only the six header routes — never the four the sidebar owned. */}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default UserDropdown;
