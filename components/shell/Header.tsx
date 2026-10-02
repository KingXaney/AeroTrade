import Link from "next/link";
import SearchCommand from "@/components/shell/SearchCommand";
import UserDropdown from "@/components/shell/UserDropdown";
import MobileNav from "@/components/shell/MobileNav";
import type {NavBadges} from "@/lib/shell/navigation";
import type {User} from '@/lib/auth/types';
import type {Stock} from '@/lib/stocks/types';
import type {TopicLink} from '@/lib/topics/types';

type HeaderProps = {
    user: User;
    initialStocks: Stock[];
    initialTopics: TopicLink[];
    navBadges: NavBadges;
};

// The top bar: where you are (the logo), how to get anywhere (search) and who you are (the
// account menu). The sections live on the rail (components/shell/Rail.tsx) at lg and in the
// drawer below it; the bar repeats none of them.
function Header({user, initialStocks, initialTopics, navBadges}: HeaderProps) {
    return (
        <header className='header'>
            <div className='header-wrapper gap-3'>
                <div className="flex items-center gap-3 shrink-0">
                    <MobileNav badges={navBadges}/>
                    <Link href="/" className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-brand-strong"
                              style={{ fontVariationSettings: "'FILL' 1" }}>
                            terminal
                        </span>
                        <span className="text-xl font-semibold tracking-tighter text-brand font-heading">
                            AeroTrade
                        </span>
                    </Link>
                </div>

                {/* The one search trigger, at every width: ⌘K is a keyboard's shortcut, and a
                    phone has none. */}
                <SearchCommand renderAs="text" label="Search stocks, topics and pages" initialStocks={initialStocks} initialTopics={initialTopics}/>

                {/* lg:mr-14 leaves the bar's end to the assistant's button (components/chat/ChatWidget),
                    which sits there at lg instead of floating over the page. */}
                <div className="flex items-center gap-3 shrink-0 lg:mr-14">
                    <UserDropdown user={user} friendRequests={navBadges.friendRequests ?? 0}/>
                </div>
            </div>
        </header>
    )
}

export default Header
