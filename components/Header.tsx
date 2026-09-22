import Link from "next/link";
import NavItems from "@/components/NavItems";
import UserDropdown from "@/components/UserDropdown";
import MobileNav from "@/components/MobileNav";
import type {NavBadges} from "@/lib/navigation";

type HeaderProps = {
    user: User;
    initialStocks: StockWithWatchlistStatus[];
    initialTopics: TopicLink[];
    navBadges: NavBadges;
};

function Header({user, initialStocks, initialTopics, navBadges}: HeaderProps) {
    return (
        <header className='header'>
            <div className='header-wrapper'>
                {/* Brand */}
                <div className="flex items-center gap-4 sm:gap-6 xl:gap-8">
                    {/* The sidebar is hidden below lg and carries the only links to
                        /watchlist, /friends, /history and /settings. */}
                    <MobileNav badges={navBadges}/>
                    <Link href="/" className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-brand-strong"
                              style={{ fontVariationSettings: "'FILL' 1" }}>
                            terminal
                        </span>
                        <span className="text-xl font-semibold tracking-tighter text-brand"
                              style={{ fontFamily: 'var(--type-display)' }}>
                            AeroTrade
                        </span>
                    </Link>
                    {/* Below lg the drawer carries every route; showing the header list too
                        overflowed the bar between 640 and 1023px. */}
                    <nav className="hidden lg:block">
                        <NavItems initialStocks={initialStocks} initialTopics={initialTopics}/>
                    </nav>
                </div>

                {/* Right Section */}
                <div className="flex items-center gap-3">
                    <UserDropdown user={user}/>
                </div>
            </div>
        </header>
    )
}

export default Header
