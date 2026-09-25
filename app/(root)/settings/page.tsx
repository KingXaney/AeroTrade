import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/lib/better-auth/auth";
import {getNotificationPreferences} from "@/lib/actions/preferences.actions";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AccountSection from "@/components/settings/AccountSection";
import SectionHeading from "@/components/primitives/SectionHeading";
import DashboardSettings from "@/components/settings/DashboardSettings";
import TopicsSettings from "@/components/settings/TopicsSettings";
import NewsFeedSettings from "@/components/settings/NewsFeedSettings";
import {getNewsFeedPrefs} from "@/lib/news/feed-store";
import {getCachedTopicsOverview} from "@/lib/dashboard/cached";
import {getDashboardLayoutForUser} from "@/lib/dashboard/layout-store";
import {filterAvailable} from "@/lib/dashboard/layout";
import {getPortfoliosForUser} from "@/lib/trading/account";
import {WIDGET_IDS, WIDGETS, isWidgetAvailable} from "@/lib/dashboard/widgets";

const SECTIONS = [
    {id: 'topics', label: 'Topics', icon: 'interests'},
    {id: 'news', label: 'News feed', icon: 'feed'},
    {id: 'appearance', label: 'Appearance', icon: 'palette'},
    {id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard'},
    {id: 'notifications', label: 'Notifications', icon: 'notifications'},
    {id: 'account', label: 'Account', icon: 'person'},
];

const SettingsPage = async () => {
    const session = await auth.api.getSession({headers: await headers()});
    if (!session?.user) redirect('/sign-in');
    const user: User = {id: session.user.id, name: session.user.name, email: session.user.email};

    const [notifications, layout, portfolios, topics, newsFeed] = await Promise.all([
        getNotificationPreferences(),
        getDashboardLayoutForUser(user.id),
        getPortfoliosForUser(user.id),
        getCachedTopicsOverview(user.id),
        getNewsFeedPrefs(user.id),
    ]);
    const availability = {accountCount: portfolios.length, advanced: true};
    const availableIds = WIDGET_IDS.filter((id) => isWidgetAvailable(WIDGETS[id], availability));
    const visibleLayout = filterAvailable(layout, availability);   // same view as the dashboard

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                    Settings
                </h1>
                <p className="text-sm text-fg-muted">Topics, your news feed, appearance, dashboard layout, notifications and your account</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <nav className="lg:col-span-3 lg:sticky lg:top-24 glass-panel rounded-xl p-2" aria-label="Settings sections">
                    {SECTIONS.map((s) => (
                        <a key={s.id} href={`#${s.id}`}
                           className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold tracking-[0.1em] uppercase text-fg-soft hover:text-fg hover:bg-surface-3 transition-colors"
                           style={{fontFamily: 'var(--type-mono)'}}>
                            <span className="material-symbols-outlined text-base">{s.icon}</span>
                            {s.label}
                        </a>
                    ))}
                </nav>

                <div className="lg:col-span-9 space-y-4">
                    <section id="topics" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>Topics</SectionHeading>
                        <TopicsSettings overview={topics} />
                    </section>

                    <section id="news" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>News feed</SectionHeading>
                        <NewsFeedSettings initial={newsFeed} />
                    </section>

                    <section id="appearance" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>Appearance</SectionHeading>
                        <AppearanceSettings />
                    </section>

                    <section id="dashboard" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>Dashboard</SectionHeading>
                        <DashboardSettings initialLayout={visibleLayout} availableIds={availableIds} />
                    </section>

                    <section id="notifications" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>Notifications</SectionHeading>
                        <NotificationSettings initial={notifications} />
                    </section>

                    <section id="account" className="glass-panel rounded-xl p-5 scroll-mt-24">
                        <SectionHeading>Account</SectionHeading>
                        <AccountSection user={user} />
                    </section>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
