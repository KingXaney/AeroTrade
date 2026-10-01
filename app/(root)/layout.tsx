import Header from "@/components/shell/Header";
import Sidebar from "@/components/shell/Sidebar";
import {getSessionUser} from "@/lib/auth/session";
import {redirect} from "next/navigation";
import {getShellView} from "@/lib/shell/shell-store";
import ChatWidget from "@/components/chat/ChatWidget";
import ThemeSync from "@/components/theme/ThemeSync";

// Every page under (root) reads the session from request headers, so they can never be
// statically prerendered. Declaring this avoids a build-time dynamic-usage error.
export const dynamic = 'force-dynamic';

// The shell's reads and its sidebar view-models live in getShellView (lib/shell/shell-store.ts,
// lib/shell/sidebar.ts); the layout only composes them.
const Layout = async ({children}: {children: React.ReactNode}) => {
    const user = await getSessionUser()

    if (!user) redirect('/sign-in')

    const shell = await getShellView(user.id);

    return (
        <main className="min-h-screen" style={{ color: 'var(--fg-soft)' }}>
            <Header
                user={user}
                initialStocks={shell.initialStocks}
                initialTopics={shell.initialTopics}
                navBadges={shell.navBadges}
            />
            <Sidebar portfolio={shell.portfolio} topics={shell.topics} badges={shell.navBadges} />
            <div className="pt-20 lg:ml-64 px-6 pb-8">
                {children}
            </div>
            <ChatWidget userId={user.id}/>
            <ThemeSync dbTheme={shell.savedTheme}/>
        </main>
    )
}

export default Layout
