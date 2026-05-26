import Link from "next/link";
import Image from "next/image";
import NavItems from "@/components/NavItems";
import UserDropdown from "@/components/UserDropdown";

type HeaderProps = {
    user: User;
    initialStocks: StockWithWatchlistStatus[];
};

function Header({user, initialStocks}: HeaderProps) {
    return (
        <header className='sticky top-0 header'>
            <div className='container header-wrapper'>
                <Link href="/">
                    <Image src="/assets/icons/logo.png" alt="AlgoTest logo" width={140} height={32} className="h-8 w-auto cursor-pointer"/>
                </Link>
                <nav className="hidden sm:block">
                    <NavItems initialStocks={initialStocks}/>
                </nav>


                <UserDropdown user={user} initialStocks={initialStocks}/>
            </div>
        </header>
    )
}

export default Header
