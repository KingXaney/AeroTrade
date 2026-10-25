import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {getNotificationPreferences} from "@/lib/settings/preferences-store";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AccountSection from "@/components/settings/AccountSection";
import SettingsHashRedirect from "@/components/settings/SettingsHashRedirect";
import SectionHeading from "@/components/primitives/SectionHeading";
import PageTitle from "@/components/primitives/PageTitle";
import DashboardSettings from "@/components/settings/DashboardSettings";
import TopicsSettings from "@/components/settings/TopicsSettings";
import NewsFeedSettings from "@/components/settings/NewsFeedSettings";
import {getNewsFeedPrefs} from "@/lib/news/feed-store";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {getVisibleLayout} from "@/lib/dashboard/availability";
import Panel from "@/components/primitives/Panel";
import {cn} from "@/lib/utils";
import type {User} from "@/lib/auth/types";
import {isBrokerOwner} from "@/lib/broker/config";
import {getBrokerView} from "@/lib/broker/page-store";
import BrokerSettings from "@/components/settings/BrokerSettings";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Settings"};

// Broker's Sync now runs one Alpaca sync inside its server action (a clock, an account, the
// positions, an asset a symbol and up to twenty orders): the default budget could cut it off.
export const maxDuration = 60;

const SECTIONS = [
    {id: 'topics', label: 'Topics', icon: 'interests'},
    {id: 'news', label: 'News feed', icon: 'feed'},
    {id: 'appearance', label: 'Appearance', icon: 'palette'},
    {id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard'},
    {id: 'notifications', label: 'Notifications', icon: 'notifications'},
    {id: 'account', label: 'Account', icon: 'person'},
    // The owner's Alpaca link (lib/broker): shown only to the broker owner.
    {id: 'broker', label: 'Broker', icon: 'account_balance'},
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const OWNER_SECTIONS: readonly SectionId[] = ['broker'];
const sectionsFor = (user: User) => SECTIONS.filter((s) => !OWNER_SECTIONS.includes(s.id) || isBrokerOwner(user.email));
const SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id);
const hrefOf = (id: SectionId) => (id === SECTIONS[0].id ? '/settings' : `/settings?tab=${id}`);

type SettingsPageProps = {searchParams: Promise<{tab?: string}>};

// One section at a time, chosen in the URL (?tab=). It used to be six editors stacked on one
// scroll — about a hundred controls on screen at once — and each section now reads only its
// own data.
const Section = async ({id, user}: {id: SectionId; user: User}) => {
    switch (id) {
        case 'topics':
            return <TopicsSettings overview={await getCachedTopicsOverview(user.id)} />;
        case 'news':
            return <NewsFeedSettings initial={await getNewsFeedPrefs(user.id)} />;
        case 'appearance':
            return <AppearanceSettings />;
        case 'dashboard': {
            // The same view as the dashboard.
            const {layout, availableIds} = await getVisibleLayout(user.id);
            return <DashboardSettings initialLayout={layout} availableIds={availableIds} />;
        }
        case 'notifications':
            return <NotificationSettings initial={await getNotificationPreferences(user.id)} />;
        case 'account':
            return <AccountSection user={user} />;
        case 'broker':
            return <BrokerSettings view={await getBrokerView(user.id)} />;
    }
};

const SettingsPage = async ({searchParams}: SettingsPageProps) => {
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');

    const {tab} = await searchParams;
    // An owner-only section is no section at all for anyone else.
    const visible = sectionsFor(user);
    const section = visible.find((s) => s.id === tab) ?? visible[0];
    const active: SectionId = section.id;

    return (
        <div className="space-y-4">
            <SettingsHashRedirect sections={SECTION_IDS} active={active}/>
            <PageTitle title="Settings" subtitle="Topics, your news feed, appearance, dashboard layout, notifications and your account" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* The wrapper is what sticks: .glass-panel sets position itself, so `sticky` on the Panel
                    lost to it and its `top` pushed the nav 96px down the page instead. */}
                <div className="lg:col-span-3 lg:sticky lg:top-24">
                <Panel as="nav" pad={2} aria-label="Settings sections">
                    {visible.map((s) => (
                        <Link key={s.id} href={hrefOf(s.id)} replace scroll={false}
                              aria-current={s.id === active ? 'page' : undefined}
                              data-settings-tab={s.id}
                              className={cn(
                                  'control-type flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-colors',
                                  s.id === active ? 'bg-brand/10 text-brand' : 'text-fg-soft hover:text-fg hover:bg-surface-3',
                              )}>
                            <span className="material-symbols-outlined text-base" aria-hidden="true">{s.icon}</span>
                            {s.label}
                        </Link>
                    ))}
                </Panel>
                </div>

                <div className="lg:col-span-9">
                    <Panel id={section.id} className="scroll-mt-24">
                        <SectionHeading>{section.label}</SectionHeading>
                        <Section id={active} user={user}/>
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
