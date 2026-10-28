import Header from "@/components/shell/Header";
import Rail from "@/components/shell/Rail";
import SectionTabs from "@/components/shell/SectionTabs";
import {getSessionUser} from "@/lib/auth/session";
import {redirect} from "next/navigation";
import {getShellView} from "@/lib/shell/shell-store";
import {navPagesFor, navSectionsFor} from "@/lib/shell/navigation";
import {isLabOwner} from "@/lib/lab/owner";
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
    // The owner's lab, both brains, the trading agent world and the strategies are the parts not
    // every account sees (lib/lab/owner.ts).
    const audience = {owner: isLabOwner(user.email)};
    const sections = navSectionsFor(audience);

    return (
        <main className="min-h-screen text-fg-soft">
            <Header
                user={user}
                initialStocks={shell.initialStocks}
                initialTopics={shell.initialTopics}
                navBadges={shell.navBadges}
                navSections={sections}
                navPages={navPagesFor(audience)}
                owner={audience.owner}
            />
            <Rail portfolio={shell.portfolio} news={shell.news} badges={shell.navBadges} sections={sections} />
            {/* pb-24: the assistant's launcher floats over this corner (components/chat/ChatWidget). */}
            <div className="pt-20 lg:ml-16 px-6 pb-24" data-app-content>
                <SectionTabs badges={shell.navBadges} sections={sections} />
                {children}
            </div>
            <ChatWidget userId={user.id} owner={audience.owner}/>
            <ThemeSync dbTheme={shell.savedTheme}/>
        </main>
    )
}

export default Layout
