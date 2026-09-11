'use client';

import {useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import Link from "next/link";
import {Menu} from "lucide-react";
import {Sheet, SheetContent, SheetTrigger} from "@/components/ui/sheet";
import NavList from "@/components/nav/NavList";
import {signOut} from "@/lib/actions/auth.actions";
import type {NavBadges} from "@/lib/navigation";

// Below lg the sidebar is hidden, and it was the only surface linking /watchlist,
// /friends, /history and /settings — so on a phone (or a narrow window) those four pages
// had no link anywhere. This drawer renders the same registry the sidebar does.
const MobileNav = ({badges}: {badges?: NavBadges}) => {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Every link inside the drawer closes it on click, but Radix does not close on a
    // route change it didn't cause — a browser Back while the drawer is open would
    // otherwise leave it covering the new page.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- closing on external navigation is the point
        setOpen(false);
    }, [pathname]);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button
                    type="button"
                    aria-label="Open navigation"
                    className="lg:hidden inline-flex items-center justify-center size-9 -ml-1 rounded-lg text-fg-soft hover:text-fg hover:bg-surface-3/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
                >
                    <Menu className="size-5"/>
                </button>
            </SheetTrigger>

            <SheetContent title="Navigation">
                <div className="flex items-center gap-2 px-4 h-16 border-b border-line-strong/15">
                    <span className="material-symbols-outlined text-brand-strong"
                          style={{fontVariationSettings: "'FILL' 1"}}>terminal</span>
                    <span className="text-lg font-semibold tracking-tighter text-brand"
                          style={{fontFamily: 'var(--type-display)'}}>AeroTrade</span>
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    <NavList pathname={pathname} badges={badges} onNavigate={() => setOpen(false)}/>
                </div>

                <div className="mt-auto p-4 border-t border-line-strong/15">
                    <Link
                        href="/trade"
                        onClick={() => setOpen(false)}
                        className="w-full py-3 rounded-lg mb-3 flex justify-center items-center gap-2 text-xs font-bold tracking-[0.1em] uppercase transition-all active:scale-[0.98]"
                        style={{
                            fontFamily: 'var(--type-mono)',
                            backgroundColor: 'var(--brand)',
                            color: 'var(--on-brand)',
                        }}
                    >
                        <span className="material-symbols-outlined text-base">candlestick_chart</span>
                        Trade Now
                    </Link>
                    <button
                        type="button"
                        onClick={async () => {
                            setOpen(false);
                            await signOut();
                        }}
                        className="w-full flex items-center gap-4 px-4 py-2 text-fg-soft hover:text-negative transition-colors text-xs font-bold tracking-[0.1em] uppercase"
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        <span>Logout</span>
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default MobileNav;
