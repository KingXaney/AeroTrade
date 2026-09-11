'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/actions/auth.actions";
import PortfolioSidebarCard, { type SidebarPortfolio } from "@/components/PortfolioSidebarCard";
import TopicsSidebarCard, { type SidebarTopics } from "@/components/topics/TopicsSidebarCard";
import NavList from "@/components/nav/NavList";
import type { NavBadges } from "@/lib/navigation";

type SidebarProps = {
    portfolio: SidebarPortfolio | null;
    topics: SidebarTopics;
    /** Same counts the mobile drawer gets, so the two surfaces can't disagree. */
    badges: NavBadges;
};

function Sidebar({ portfolio, topics, badges }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/sign-in');
    };

    return (
        <aside className="hidden lg:flex fixed left-0 top-16 bottom-0 z-40 flex-col w-64 border-r border-outline-variant/20"
               style={{
                   backgroundColor: 'color-mix(in srgb, var(--surface-2) 90%, transparent)',
                   backdropFilter: 'blur(16px)',
                   WebkitBackdropFilter: 'blur(16px)',
               }}
        >
            <div className="p-6 flex-1 overflow-y-auto">
                <TopicsSidebarCard topics={topics} />

                {portfolio && <PortfolioSidebarCard portfolio={portfolio} />}

                <NavList pathname={pathname} badges={badges} />
            </div>

            <div className="mt-auto p-4 border-t border-line-strong/15">
                <Link
                    href="/trade"
                    className="w-full py-3 rounded-lg mb-4 flex justify-center items-center gap-2 text-xs font-bold tracking-[0.1em] uppercase transition-all active:scale-[0.98] animate-glow"
                    style={{
                        fontFamily: 'var(--type-mono)',
                        backgroundColor: 'var(--brand)',
                        color: 'var(--on-brand)',
                        boxShadow: '0 0 15px color-mix(in srgb, var(--brand) 30%, transparent)',
                    }}
                >
                    <span className="material-symbols-outlined text-base">candlestick_chart</span>
                    Trade Now
                </Link>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-4 px-4 py-2 text-fg-soft hover:text-negative transition-colors text-xs font-bold tracking-[0.1em] uppercase"
                    style={{ fontFamily: 'var(--type-mono)' }}
                >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
