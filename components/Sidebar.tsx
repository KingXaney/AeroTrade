'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";

const sidebarNavItems = [
    { href: '/', label: 'Dashboard', icon: 'space_dashboard' },
    { href: '/markets', label: 'Markets', icon: 'query_stats' },
    { href: '/trade', label: 'Trade', icon: 'candlestick_chart' },
    { href: '/watchlist', label: 'Watchlist', icon: 'bookmark' },
    { href: '/friends', label: 'Friends', icon: 'group' },
    { href: '/history', label: 'History', icon: 'history' },
];

type SidebarProps = {
    watchlistCount: number;
};

function Sidebar({ watchlistCount }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/sign-in');
    };

    return (
        <aside className="hidden lg:flex fixed left-0 top-16 bottom-0 z-40 flex-col w-64 border-r border-outline-variant/20"
               style={{
                   backgroundColor: 'rgba(26, 28, 32, 0.9)',
                   backdropFilter: 'blur(16px)',
                   WebkitBackdropFilter: 'blur(16px)',
               }}
        >
            {/* Watchlist Summary Card */}
            <div className="p-6">
                <Link
                    href="/watchlist"
                    className="relative block rounded-xl p-4 mb-6 shimmer overflow-hidden transition-all hover:brightness-110"
                    style={{
                        backgroundColor: 'rgba(0, 240, 255, 0.06)',
                        border: '1px solid rgba(125, 244, 255, 0.15)',
                    }}
                >
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-[#7df4ff]"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                            >bookmark</span>
                            <span className="text-[#7df4ff] text-xs font-bold tracking-[0.1em] uppercase"
                                  style={{ fontFamily: 'var(--font-jetbrains)' }}
                            >Tracked Assets</span>
                        </div>
                        <p className="text-2xl font-semibold text-[#e2e2e8]"
                           style={{ fontFamily: 'var(--font-sora)' }}
                        >{watchlistCount}</p>
                        <p className="text-sm text-[#00dbe9]"
                           style={{ fontFamily: 'var(--font-jetbrains)' }}
                        >{watchlistCount === 1 ? 'symbol' : 'symbols'} <span className="text-[#849495] text-xs">on watchlist</span></p>
                    </div>
                </Link>

                {/* Navigation Items */}
                <nav className="space-y-1">
                    {sidebarNavItems.map((item) => {
                        const isActive = item.href === '/'
                            ? pathname === '/'
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-4 px-4 py-3 transition-all text-xs font-bold tracking-[0.1em] uppercase",
                                    isActive
                                        ? "text-[#d1bcff] border-l-4 border-[#d1bcff]"
                                        : "text-[#b9cacb] hover:text-[#e2e2e8] hover:bg-[#282a2e]"
                                )}
                                style={{ fontFamily: 'var(--font-jetbrains)' }}
                            >
                                <span
                                    className="material-symbols-outlined"
                                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                >{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Section */}
            <div className="mt-auto p-4 border-t border-[rgba(59,73,75,0.15)]">
                <Link
                    href="/trade"
                    className="w-full py-3 rounded-lg mb-4 flex justify-center items-center gap-2 text-xs font-bold tracking-[0.1em] uppercase transition-all active:scale-[0.98] animate-glow"
                    style={{
                        fontFamily: 'var(--font-jetbrains)',
                        backgroundColor: '#7df4ff',
                        color: '#002022',
                        boxShadow: '0 0 15px rgba(125, 244, 255, 0.3)',
                    }}
                >
                    <span className="material-symbols-outlined text-base">candlestick_chart</span>
                    Trade Now
                </Link>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-4 px-4 py-2 text-[#b9cacb] hover:text-[#ffb4ab] transition-colors text-xs font-bold tracking-[0.1em] uppercase"
                    style={{ fontFamily: 'var(--font-jetbrains)' }}
                >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
