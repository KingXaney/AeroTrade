'use client';

import {useState, useEffect, useTransition} from "react";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Switch} from "@/components/ui/switch";

import {useRouter} from "next/navigation";
import {LogOut, ChevronDown, Mail} from "lucide-react";
import NavItems from "@/components/NavItems";
import {signOut} from "@/lib/actions/auth.actions";
import {getEmailNotificationPreference, toggleEmailNotifications} from "@/lib/actions/preferences.actions";
import {toast} from "sonner";

function UserDropdown({user, initialStocks}: {user: User; initialStocks: StockWithWatchlistStatus[]}) {
    const router = useRouter();
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [hasFetched, setHasFetched] = useState(false);

    useEffect(() => {
        getEmailNotificationPreference(user.id).then((enabled) => {
            setEmailEnabled(enabled);
            setHasFetched(true);
        });
    }, [user.id]);

    const handleToggleEmail = (checked: boolean) => {
        // Optimistic update
        setEmailEnabled(checked);
        startTransition(async () => {
            const result = await toggleEmailNotifications(user.id, checked);
            if (result.success) {
                toast.success(checked ? 'Subscribed to email alerts' : 'Unsubscribed from email alerts');
            } else {
                setEmailEnabled(!checked);
                toast.error('Failed to update email preference');
            }
        });
    };

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
                    className="group inline-flex items-center gap-3 rounded-full px-2 py-1.5 text-[#b9cacb] hover:bg-[#282a2e]/60 hover:text-[#e2e2e8] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#00f0ff]"
                >
                    <Avatar className="h-9 w-9 ring-1 ring-[#3b494b] group-hover:ring-[#00f0ff] transition-all">
                        <AvatarImage src="https://example.com/avatar.jpg" alt={user.name}/>
                        <AvatarFallback
                            className="text-sm font-bold"
                            style={{
                                backgroundColor: '#00f0ff',
                                color: '#002022',
                                fontFamily: 'var(--font-sora)',
                            }}
                        >
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium text-[#e2e2e8]"
                              style={{ fontFamily: 'var(--font-sora)' }}>
                            {user.name}
                        </span>
                        <span className="text-[10px] text-[#849495]"
                              style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                            Verified Node
                        </span>
                    </div>
                    <ChevronDown className="hidden md:block size-4 text-[#849495] group-hover:text-[#b9cacb] transition-transform group-data-[state=open]:rotate-180"/>
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={10}
                className="w-64 !shadow-2xl !p-2"
                style={{
                    backgroundColor: 'rgba(12, 14, 18, 0.95)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid rgba(59, 73, 75, 0.4)',
                    color: '#e2e2e8',
                }}
            >
                {/* Profile card */}
                <DropdownMenuLabel className="!p-0">
                    <div className="flex items-center gap-3 rounded-md p-3"
                         style={{ backgroundColor: 'rgba(30, 32, 36, 0.5)' }}>
                        <Avatar className="h-11 w-11 ring-1 ring-[#3b494b]">
                            <AvatarImage src="https://example.com/avatar.jpg" alt={user.name}/>
                            <AvatarFallback
                                className="text-base font-bold"
                                style={{ backgroundColor: '#00f0ff', color: '#002022', fontFamily: 'var(--font-sora)' }}
                            >
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-[#e2e2e8] truncate"
                                  style={{ fontFamily: 'var(--font-sora)' }}>
                                {user.name}
                            </span>
                            <span className="text-xs text-[#849495] truncate"
                                  style={{ fontFamily: 'var(--font-jetbrains)' }}>
                                {user.email}
                            </span>
                        </div>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator style={{ backgroundColor: '#1e2024', margin: '8px 0' }}/>

                {/* Email notifications toggle */}
                <div className="flex items-center justify-between rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <Mail className="size-4 text-[#b9cacb]"/>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-[#e2e2e8]">Email alerts</span>
                            <span className="text-[11px] text-[#849495] leading-tight">Daily news & updates</span>
                        </div>
                    </div>
                    <Switch
                        id="email-notifications-toggle"
                        checked={emailEnabled}
                        onCheckedChange={handleToggleEmail}
                        disabled={isPending || !hasFetched}
                        className="data-[state=checked]:!bg-[#00f0ff] data-[state=unchecked]:!bg-[#333539] data-[state=unchecked]:!border data-[state=unchecked]:!border-[#3b494b] transition-colors duration-200"
                    />
                </div>

                <DropdownMenuSeparator style={{ backgroundColor: '#1e2024', margin: '8px 0' }}/>

                {/* Logout — destructive intent */}
                <DropdownMenuItem
                    onClick={handleSignOut}
                    className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-[#e2e2e8] focus:!bg-[rgba(255,180,171,0.1)] focus:!text-[#ffb4ab] transition-colors"
                >
                    <LogOut className="size-4 text-[#b9cacb] group-focus:text-[#ffb4ab] transition-colors"/>
                    Log out
                </DropdownMenuItem>

                {/* Mobile-only nav (visible <sm) */}
                <div className="sm:hidden">
                    <DropdownMenuSeparator style={{ backgroundColor: '#1e2024', margin: '8px 0' }}/>
                    <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-[#849495]"
                         style={{ fontFamily: 'var(--font-jetbrains)' }}>
                        Menu
                    </div>
                    <div className="px-1 pb-1">
                        <NavItems initialStocks={initialStocks}/>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default UserDropdown;
