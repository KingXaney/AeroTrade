import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {getNotificationPreferences} from "@/lib/settings/preferences-store";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AccountSection from "@/components/settings/AccountSection";
import SectionHeading from "@/components/primitives/SectionHeading";
import DashboardSettings from "@/components/settings/DashboardSettings";
import TopicsSettings from "@/components/settings/TopicsSettings";
import NewsFeedSettings from "@/components/settings/NewsFeedSettings";
import {getNewsFeedPrefs} from "@/lib/news/feed-store";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {getVisibleLayout} from "@/lib/dashboard/availability";
import Panel from "@/components/primitives/Panel";

const SECTIONS = [
    {id: 'topics', label: 'Topics', icon: 'interests'},
    {id: 'news', label: 'News feed', icon: 'feed'},
    {id: 'appearance', label: 'Appearance', icon: 'palette'},
    {id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard'},
    {id: 'notifications', label: 'Notifications', icon: 'notifications'},
    {id: 'account', label: 'Account', icon: 'person'},
];

const SettingsPage = async () => {
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');

    const [notifications, {layout: visibleLayout, availableIds}, topics, newsFeed] = await Promise.all([
        getNotificationPreferences(user.id),
        getVisibleLayout(user.id),   // the same view as the dashboard
        getCachedTopicsOverview(user.id),
        getNewsFeedPrefs(user.id),
    ]);

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                    Settings
                </h1>
                <p className="text-sm text-fg-muted">Topics, your news feed, appearance, dashboard layout, notifications and your account</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <Panel as="nav" pad={2} className="lg:col-span-3 lg:sticky lg:top-24" aria-label="Settings sections">
                    {SECTIONS.map((s) => (
                        <a key={s.id} href={`#${s.id}`}
                           className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold tracking-[0.1em] uppercase text-fg-soft hover:text-fg hover:bg-surface-3 transition-colors"
                           style={{fontFamily: 'var(--type-mono)'}}>
                            <span className="material-symbols-outlined text-base">{s.icon}</span>
                            {s.label}
                        </a>
                    ))}
                </Panel>

                <div className="lg:col-span-9 space-y-4">
                    <Panel id="topics" className="scroll-mt-24">
                        <SectionHeading>Topics</SectionHeading>
                        <TopicsSettings overview={topics} />
                    </Panel>

                    <Panel id="news" className="scroll-mt-24">
                        <SectionHeading>News feed</SectionHeading>
                        <NewsFeedSettings initial={newsFeed} />
                    </Panel>

                    <Panel id="appearance" className="scroll-mt-24">
                        <SectionHeading>Appearance</SectionHeading>
                        <AppearanceSettings />
                    </Panel>

                    <Panel id="dashboard" className="scroll-mt-24">
                        <SectionHeading>Dashboard</SectionHeading>
                        <DashboardSettings initialLayout={visibleLayout} availableIds={availableIds} />
                    </Panel>

                    <Panel id="notifications" className="scroll-mt-24">
                        <SectionHeading>Notifications</SectionHeading>
                        <NotificationSettings initial={notifications} />
                    </Panel>

                    <Panel id="account" className="scroll-mt-24">
                        <SectionHeading>Account</SectionHeading>
                        <AccountSection user={user} />
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
