import Header from "@/components/Header";
import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import ChatWidget from "@/components/chat/ChatWidget";

const Layout = async ({children}: {children: React.ReactNode}) => {
    const session = await auth.api.getSession({headers: await headers()})

    if (!session?.user) redirect('/sign-in')

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }

    // Pre-load the popular-stocks list once for the SearchCommand fallback, joined with this user's watchlist.
    const initialStocks = await searchStocks(undefined, user.id);

    return (
        <main className="min-h-screen text-gray-400">
            <Header user={user} initialStocks={initialStocks}/>
            <div className="container py-10">
                {children}
            </div>
            <ChatWidget userId={user.id}/>
        </main>
    )
}

export default Layout
