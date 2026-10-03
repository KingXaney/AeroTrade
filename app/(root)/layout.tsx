import Header from "@/components/shell/Header";
import Rail from "@/components/shell/Rail";
import SectionTabs from "@/components/shell/SectionTabs";
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
        <main className="min-h-screen text-fg-soft">
            <Header
                user={user}
                initialStocks={shell.initialStocks}
                initialTopics={shell.initialTopics}
                navBadges={shell.navBadges}
            />
            <Rail portfolio={shell.portfolio} topics={shell.topics} badges={shell.navBadges} />
            {/* pb-24: the assistant's launcher floats over this corner (components/chat/ChatWidget). */}
            <div className="pt-20 lg:ml-16 px-6 pb-24">
                <SectionTabs badges={shell.navBadges} />
                {children}
            </div>
            <ChatWidget userId={user.id}/>
            <ThemeSync dbTheme={shell.savedTheme}/>
        </main>
    )
}

export default Layout
