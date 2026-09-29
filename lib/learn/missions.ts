// The First-week checklist, derived from rows: done when the row exists, gone when
// every row exists, when it was hidden once, or after the first month. No learner
// flag is stored beyond the one-time dismissal (invariant 9: derived state first, a
// stamp-once field second).

import {daysBetween, type OnboardingFacts} from "@/lib/learn/facts";
import {MISSION_COPY, type MissionCopy, type MissionId} from "@/lib/learn/copy/missions";

export const ONBOARDING_MAX_DAYS = 30;

const DONE: Record<MissionId, (facts: OnboardingFacts) => boolean> = {
    'first-trade': (f) => f.hasUserTrade,
    'follow-strategy': (f) => f.followedStrategies.length > 0,
    'open-topic': (f) => f.topicOpened,
    'watch-symbol': (f) => f.hasWatchlist,
    'enrol-navigator': (f) => f.navigatorEnrolled,
};

export type Mission = MissionCopy & {done: boolean};

export const deriveMissions = (facts: OnboardingFacts): Mission[] =>
    MISSION_COPY.map((mission) => ({...mission, done: DONE[mission.id](facts)}));

export const missionsComplete = (facts: OnboardingFacts): boolean =>
    MISSION_COPY.every((mission) => DONE[mission.id](facts));

// True while the checklist should be on the dashboard at all.
export const onboardingActive = (facts: OnboardingFacts, today: string = facts.today): boolean => {
    if (facts.missionsDismissedAt) return false;
    if (missionsComplete(facts)) return false;
    if (facts.accountCreatedOn === null) return true;
    return daysBetween(facts.accountCreatedOn, today) <= ONBOARDING_MAX_DAYS;
};
