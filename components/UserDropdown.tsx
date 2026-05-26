'use client';

import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {useRouter} from "next/navigation";
import {LogOut, ChevronDown} from "lucide-react";
import NavItems from "@/components/NavItems";
import {signOut} from "@/lib/actions/auth.actions";

function UserDropdown({user, initialStocks}: {user: User; initialStocks: StockWithWatchlistStatus[]}) {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push("/sign-in");
    };

    const initial = user.name?.[0]?.toUpperCase() ?? '?';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {/* Plain <button> instead of <Button> — the ui Button primitive forces h-8 + nowrap
                    which crops the stacked text and chevron. */}
                <button
                    type="button"
                    className="group inline-flex items-center gap-3 rounded-full px-2 py-1.5 text-gray-300 hover:bg-gray-800/60 hover:text-gray-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
                >
                    <Avatar className="h-9 w-9 ring-1 ring-gray-700 group-hover:ring-yellow-500 transition-all">
                        <AvatarImage src="https://example.com/avatar.jpg" alt={user.name}/>
                        <AvatarFallback className="bg-yellow-500 text-gray-900 text-sm font-bold">
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium text-gray-100">{user.name}</span>
                        <span className="text-xs text-gray-500">Account</span>
                    </div>
                    <ChevronDown className="hidden md:block size-4 text-gray-500 group-hover:text-gray-300 transition-transform group-data-[state=open]:rotate-180"/>
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={10}
                className="w-64 !bg-gray-900 !border !border-gray-700 !text-gray-200 !shadow-2xl !p-2"
            >
                {/* Profile card */}
                <DropdownMenuLabel className="!p-0">
                    <div className="flex items-center gap-3 rounded-md bg-gray-800/50 p-3">
                        <Avatar className="h-11 w-11 ring-1 ring-gray-700">
                            <AvatarImage src="https://example.com/avatar.jpg" alt={user.name}/>
                            <AvatarFallback className="bg-yellow-500 text-gray-900 text-base font-bold">
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-gray-100 truncate">{user.name}</span>
                            <span className="text-xs text-gray-400 truncate">{user.email}</span>
                        </div>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="!bg-gray-800 !my-2"/>

                {/* Logout — destructive intent */}
                <DropdownMenuItem
                    onClick={handleSignOut}
                    className="group cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-gray-200 focus:!bg-red-500/10 focus:!text-red-300 transition-colors"
                >
                    <LogOut className="size-4 text-gray-400 group-focus:text-red-300 transition-colors"/>
                    Log out
                </DropdownMenuItem>

                {/* Mobile-only nav (visible <sm) */}
                <div className="sm:hidden">
                    <DropdownMenuSeparator className="!bg-gray-800 !my-2"/>
                    <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-gray-500">Menu</div>
                    <div className="px-1 pb-1">
                        <NavItems initialStocks={initialStocks}/>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default UserDropdown;
