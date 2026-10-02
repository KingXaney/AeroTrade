'use client';

import {useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import {Menu} from "lucide-react";
import {Sheet, SheetContent, SheetTrigger} from "@/components/primitives/Sheet";
import NavList from "@/components/shell/NavList";
import {useSignOut} from "@/components/shell/useSignOut";
import type {NavBadges} from "@/lib/shell/navigation";

// Below lg there is no rail, so this drawer stands in for it: the same sections from the same
// registry, then the account pages and Log out. A section's other pages are the tabs on the
// page itself (SectionTabs).
const MobileNav = ({badges}: {badges?: NavBadges}) => {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const signOut = useSignOut();

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
                    <span className="text-lg font-semibold tracking-tighter text-brand font-heading">AeroTrade</span>
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    <NavList pathname={pathname} badges={badges} onNavigate={() => setOpen(false)}/>
                </div>

                <div className="mt-auto p-4 border-t border-line-strong/15">
                    <button
                        type="button"
                        onClick={async () => {
                            if (await signOut()) setOpen(false);
                        }}
                        className="control-type w-full flex items-center gap-4 px-4 py-2 text-fg-soft hover:text-negative transition-colors text-xs"
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
