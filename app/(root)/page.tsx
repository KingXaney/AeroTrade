import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {getHomeView} from "@/lib/home/page-store";
import {getLearnFacts} from "@/lib/learn/facts-store";
import {getTodaysLesson} from "@/lib/learn/lesson-store";
import {deriveMoments} from "@/lib/learn/moments";
import {HOME_COPY} from "@/lib/learn/copy/home";
import {COURSE_COPY} from "@/lib/learn/copy/learn";
import {getCourseProgress} from "@/lib/learn/course-store";
import {NEWS_COPY} from "@/lib/learn/copy/news";
import MarketStatus from "@/components/stocks/MarketStatus";
import HomeAccounts from "@/components/home/HomeAccounts";
import TopicsOverview from "@/components/dashboard/widgets/topics/TopicsOverview";
import TopicBriefsList from "@/components/dashboard/widgets/topics/TopicBriefsList";
import TopicsWidgetEmpty from "@/components/dashboard/widgets/topics/TopicsWidgetEmpty";
import GettingStarted from "@/components/dashboard/widgets/learn/GettingStarted";
import TodaysLesson from "@/components/dashboard/widgets/learn/TodaysLesson";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

// Home shows the briefing's first points; the news page has all of them.
const HOME_BRIEFING_POINTS = 3;

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
    // The box beside the topics: the market briefing, else the topics' own briefs, else the
    // course's next lesson (today's lesson once the course is done).
    const hasBriefing = view.briefing !== null || view.hasBriefs;

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
                <Panel id="home-topics" aria-labelledby="home-topics-heading">
                    <SectionHeading id="home-topics-heading">{HOME_COPY.topicsHeading}</SectionHeading>
                    {view.topics.topics.length > 0 ? <TopicsOverview overview={view.topics} span={6}/> : <TopicsWidgetEmpty/>}
                </Panel>

                {/* A box with nothing to say is not shown: until there is a briefing, the course
                    takes this place beside the topics. */}
                {view.briefing ? (
                    <Panel id="home-briefing" aria-labelledby="home-briefing-heading">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <SectionHeading id="home-briefing-heading" spacing="none">{HOME_COPY.briefingHeading}</SectionHeading>
                            <Link href="/news" className="label-type text-xs text-brand hover:underline">{HOME_COPY.newsLink} →</Link>
                        </div>
                        {/* Model output: text nodes only, under the caveat every summary carries. */}
                        {view.briefing.headline && <p className="mb-3 font-heading text-base font-semibold leading-snug text-fg">{view.briefing.headline}</p>}
                        <ul className="space-y-2">
                            {view.briefing.bullets.slice(0, HOME_BRIEFING_POINTS).map((bullet) => (
                                <RowCard as="li" key={bullet.text} tone="brand" className="text-sm leading-relaxed text-fg">
                                    {bullet.text}
                                    <span className="mt-1 block font-mono text-[11px] text-fg-muted">{bullet.sources.map((s) => s.source).filter(Boolean).join(' · ')}</span>
                                </RowCard>
                            ))}
                        </ul>
                        <MicroLabel as="p" className="mt-3">
                            {NEWS_COPY.briefingCaveat(view.briefing.date)}
                            {view.briefing.bullets.length > HOME_BRIEFING_POINTS ? ` · ${HOME_COPY.morePoints(view.briefing.bullets.length - HOME_BRIEFING_POINTS)}` : ''}
                        </MicroLabel>
                    </Panel>
                ) : view.hasBriefs ? (
                    <Panel id="home-briefing" aria-labelledby="home-briefing-heading">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <SectionHeading id="home-briefing-heading" spacing="none">{HOME_COPY.briefingHeading}</SectionHeading>
                            <Link href="/news" className="label-type text-xs text-brand hover:underline">{HOME_COPY.newsLink} →</Link>
                        </div>
                        <p className="mb-3 text-xs text-fg-muted">{HOME_COPY.briefingNote}</p>
                        <TopicBriefsList overview={view.topics}/>
                    </Panel>
                ) : (
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
            ) : hasBriefing && (
                <Panel id="home-learn" aria-labelledby="home-learn-heading">
                    <LearnBox userId={user.id}/>
                </Panel>
            )}
        </div>
    );
};

// The beginner course's next lesson while there is one; today's lesson once the course is done.
const LearnBody = async ({userId}: {userId: string}) => {
    const progress = await getCourseProgress(userId);
    if (!progress.next) return <LessonAsync userId={userId}/>;
    return (
        <div data-home-course={progress.next.id}>
            <MicroLabel>{progress.next.moduleTitle} · {COURSE_COPY.lessonOf(progress.next.number, progress.total)}</MicroLabel>
            <h3 className="mt-1 font-heading text-lg font-semibold text-fg">{progress.next.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-soft">{progress.next.intro[0]}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/learn/course/${progress.next.id}`} className={actionButton({variant: 'secondary', size: 'md'})}>{COURSE_COPY.continueCta}</Link>
                <MicroLabel>{COURSE_COPY.progress(progress.done, progress.total)}</MicroLabel>
            </div>
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
            <LearnBody userId={userId}/>
        </Suspense>
    </>
);

export default Home;
