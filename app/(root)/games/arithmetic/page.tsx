import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {readArithmeticSkill, readGameSummary} from "@/lib/games/store";
import {parseFocus, skillView} from "@/lib/games/arithmetic-skill";
import {ARCHIVE_COPY, ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import ArithmeticGame, {type ArithmeticMode} from "@/components/games/ArithmeticGame";
import SkillPanel from "@/components/games/SkillPanel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import Tabs from "@/components/primitives/Tabs";

export const metadata: Metadata = {title: "Arithmetic"};

const MODES = ['sprint', 'custom', 'practice', 'interview'] as const satisfies readonly ArithmeticMode[];
const isMode = (value: unknown): value is ArithmeticMode => typeof value === 'string' && (MODES as readonly string[]).includes(value);
const TABS = MODES.map((id) => ({id, label: ARITHMETIC_COPY.modes[id], href: id === 'sprint' ? '/games/arithmetic' : `/games/arithmetic?mode=${id}`}));

type Props = {searchParams: Promise<{mode?: string; focus?: string}>};

// The arithmetic sprint and its modes, one at a time in the URL (?mode=). The round runs in the
// browser; the page reads the record and the last rounds for the mode's own settings, and the
// reader's aggregate of timed problems (lib/games/arithmetic-skill) for the skill panel. Practice
// takes its kinds from ?focus=, else from the kinds the panel names.
const ArithmeticPage = async ({searchParams}: Props) => {
    const userId = await requireUserId();
    const {mode: param, focus: focusParam} = await searchParams;
    const mode: ArithmeticMode = isMode(param) ? param : 'sprint';
    const [summary, skill] = await Promise.all([
        mode === 'custom' || mode === 'practice' ? null
            : mode === 'interview' ? readGameSummary(userId, 'interview', 'interview')
                : readGameSummary(userId, 'arithmetic', 'zetamac'),
        mode === 'interview' ? null : readArithmeticSkill(userId),
    ]);
    const view = skillView(skill);
    const asked = parseFocus(focusParam);
    const focus = mode === 'practice' ? (asked.length > 0 ? asked : view.weak.map((row) => row.cell)) : [];

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-arithmetic-page={mode}>
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={ARITHMETIC_COPY.title} subtitle={ARITHMETIC_COPY.subtitle}/>
            <Tabs tabs={TABS} active={mode} label={ARITHMETIC_COPY.modeLabel}/>
            <Panel pad={6}>
                <ArithmeticGame key={`${mode}:${focus.join(',')}`} mode={mode} summary={summary} focus={focus}/>
            </Panel>
            {mode !== 'interview' && <SkillPanel view={view}/>}
        </div>
    );
};

export default ArithmeticPage;
