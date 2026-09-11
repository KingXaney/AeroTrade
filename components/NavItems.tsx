'use client';

import Link from "next/link";
import {usePathname} from "next/navigation";
import SearchCommand from "@/components/search/SearchCommand";
import {HEADER_NAV_ITEMS, isActiveNav} from "@/lib/navigation";

type NavItemsProps = {
    initialStocks: StockWithWatchlistStatus[];
    initialTopics?: TopicLink[];
};

function NavItems({initialStocks, initialTopics}: NavItemsProps) {
    const pathName = usePathname();

    return (
        <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-6 items-center">
            {HEADER_NAV_ITEMS.map(({href, label}) => (
                <li key={href}>
                    <Link
                        href={href}
                        aria-current={isActiveNav(pathName, href) ? 'page' : undefined}
                        className={`transition-colors text-xs font-bold tracking-[0.1em] uppercase ${
                            isActiveNav(pathName, href)
                                ? 'text-brand border-b-2 border-brand pb-1'
                                : 'text-fg-soft hover:text-fg'
                        }`}
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        {label}
                    </Link>
                </li>
            ))}
            {/* Search is a palette trigger, not a route. It used to live in NAV_ITEMS as a
                fake '/search' entry that this component special-cased — which meant
                proxy.ts session-gated it, so middle-clicking it hit a 404. */}
            <li>
                <SearchCommand renderAs="text" label="Search" initialStocks={initialStocks} initialTopics={initialTopics}/>
            </li>
        </ul>
    )
}

export default NavItems;
