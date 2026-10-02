import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {getHomeView} from "@/lib/home/page-store";
import {getLearnFacts} from "@/lib/learn/facts-store";
import {getTodaysLesson} from "@/lib/learn/lesson-store";
import {deriveMoments} from "@/lib/learn/moments";
import {HOME_COPY} from "@/lib/learn/copy/home";
import MarketStatus from "@/components/stocks/MarketStatus";
import HomeAccounts from "@/components/home/HomeAccounts";
import TopicsOverview from "@/components/dashboard/widgets/topics/TopicsOverview";
import TopicBriefsList from "@/components/dashboard/widgets/topics/TopicBriefsList";
import TopicsWidgetEmpty from "@/components/dashboard/widgets/topics/TopicsWidgetEmpty";
import GettingStarted from "@/components/dashboard/widgets/learn/GettingStarted";
import TodaysLesson from "@/components/dashboard/widgets/learn/TodaysLesson";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

type HomeProps = {
    searchParams: Promise<{customize?: string}>;
};

// Read under Suspense, so the page paints before the lesson: a first from the account wins and
// never reads the day's concept at all (as on the dashboard widget).
const LessonAsync = async ({userId}: {userId: string}) => {
    const facts = await getLearnFacts(userId);
    const moment = deriveMoments(facts, facts.today)[0];
    if (moment) return <TodaysLesson moment={moment}/>;
    return <TodaysLesson lesson={await getTodaysLesson(userId)}/>;
};

// Home: who you are, where the market is, what you own, what changed in what you follow, and
// one thing to look at next. Numbers first; nothing here is a setting. The widget grid this
// page used to be is /dashboard.
const Home = async ({searchParams}: HomeProps) => {
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');
    // Old links to the dashboard's edit mode (/?customize=1) keep working.
    if ((await searchParams).customize === '1') redirect('/dashboard?customize=1');

    const view = await getHomeView(user.id);
    const {step} = view;

    return (
        <div className="space-y-4" data-home>
            <PageTitle
                title={HOME_COPY.greeting(user.name)}
                subtitle={HOME_COPY.subtitle}
                actions={<MarketStatus status={view.market}/>}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel id="home-accounts" aria-labelledby="home-accounts-heading">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <SectionHeading id="home-accounts-heading" spacing="none">{HOME_COPY.accountsHeading}</SectionHeading>
                        <Link href="/portfolio" className="label-type text-xs text-brand hover:underline">{HOME_COPY.portfolioLink} →</Link>
                    </div>
                    <HomeAccounts accounts={view.accounts}/>
                </Panel>

                <Panel id="home-next-step" aria-labelledby="home-step-heading" className="flex flex-col">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <SectionHeading id="home-step-heading" spacing="none">{HOME_COPY.nextStepHeading}</SectionHeading>
                        {step.progress && <MicroLabel>{step.progress}</MicroLabel>}
                    </div>
                    <h3 className="font-heading text-xl font-semibold text-fg">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-soft">{step.body}</p>
                    <div className="mt-auto pt-5">
                        <Link href={step.href} className={actionButton({size: 'md'})} data-home-step>{step.cta}</Link>
                    </div>
                </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Alone in its row (a new account: no brief yet, the lesson still to come), it takes the row. */}
                <Panel id="home-topics" aria-labelledby="home-topics-heading" className={view.hasBriefs || !view.missions ? undefined : 'lg:col-span-2'}>
                    <SectionHeading id="home-topics-heading">{HOME_COPY.topicsHeading}</SectionHeading>
                    {view.topics.topics.length > 0 ? <TopicsOverview overview={view.topics} span={6}/> : <TopicsWidgetEmpty/>}
                </Panel>

                {/* A box with nothing to say is not shown: until a topic has a brief, the lesson
                    takes this place beside the topics. */}
                {view.hasBriefs ? (
                    <Panel id="home-briefing" aria-labelledby="home-briefing-heading">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <SectionHeading id="home-briefing-heading" spacing="none">{HOME_COPY.briefingHeading}</SectionHeading>
                            <Link href="/news" className="label-type text-xs text-brand hover:underline">{HOME_COPY.newsLink} →</Link>
                        </div>
                        <p className="mb-3 text-xs text-fg-muted">{HOME_COPY.briefingNote}</p>
                        <TopicBriefsList overview={view.topics}/>
                    </Panel>
                ) : !view.missions && (
                    <Panel id="home-learn" aria-labelledby="home-learn-heading">
                        <LearnBox userId={user.id}/>
                    </Panel>
                )}
            </div>

            {view.missions ? (
                <Panel id="home-first-week" aria-labelledby="home-first-week-heading">
                    <SectionHeading id="home-first-week-heading">{HOME_COPY.firstWeekHeading}</SectionHeading>
                    <GettingStarted missions={view.missions}/>
                </Panel>
            ) : view.hasBriefs && (
                <Panel id="home-learn" aria-labelledby="home-learn-heading">
                    <LearnBox userId={user.id}/>
                </Panel>
            )}
        </div>
    );
};

const LearnBox = ({userId}: {userId: string}) => (
    <>
        <div className="mb-4 flex items-center justify-between gap-3">
            <SectionHeading id="home-learn-heading" spacing="none">{HOME_COPY.learnHeading}</SectionHeading>
            <Link href="/learn" className="label-type text-xs text-brand hover:underline">{HOME_COPY.learnLink} →</Link>
        </div>
        <Suspense fallback={<WidgetSkeleton height={160} rows={3}/>}>
            <LessonAsync userId={userId}/>
        </Suspense>
    </>
);

export default Home;
