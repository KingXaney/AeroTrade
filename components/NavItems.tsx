'use client';

import {NAV_ITEMS} from "@/lib/constants";
import Link from "next/link";
import {usePathname} from "next/navigation";
import SearchCommand from "@/components/search/SearchCommand";

type NavItemsProps = {
    initialStocks: StockWithWatchlistStatus[];
};

function NavItems({initialStocks}: NavItemsProps) {
    const pathName = usePathname()

    const isActive = (path: string) => {
        if (path === '/') return pathName === '/';
        return pathName.startsWith(path);
    }

    return (
        <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium items-center">
            {NAV_ITEMS.map(({href, label}) => {
                // The Search entry is a trigger for the command palette, not a route.
                if (label === 'Search') {
                    return (
                        <li key={href}>
                            <SearchCommand renderAs="text" label="Search" initialStocks={initialStocks} />
                        </li>
                    );
                }
                return (
                    <li key={href}>
                        <Link href={href} className={`hover:text-yellow-500 transition-colors ${
                            isActive(href) ? 'text-gray-100' : ''
                        }`}>
                            {label}
                        </Link>
                    </li>
                );
            })}
        </ul>
    )
}

export default NavItems
