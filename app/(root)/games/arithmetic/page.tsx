import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {readGameSummary} from "@/lib/games/store";
import {ARCHIVE_COPY, ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import ArithmeticGame, {type ArithmeticMode} from "@/components/games/ArithmeticGame";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import Tabs from "@/components/primitives/Tabs";

export const metadata: Metadata = {title: "Arithmetic"};

const MODES = ['sprint', 'custom', 'interview'] as const satisfies readonly ArithmeticMode[];
const isMode = (value: unknown): value is ArithmeticMode => typeof value === 'string' && (MODES as readonly string[]).includes(value);
const TABS = MODES.map((id) => ({id, label: ARITHMETIC_COPY.modes[id], href: id === 'sprint' ? '/games/arithmetic' : `/games/arithmetic?mode=${id}`}));

type Props = {searchParams: Promise<{mode?: string}>};

// The arithmetic sprint and its modes, one at a time in the URL (?mode=). The round runs in the
// browser; the page reads the record and the last rounds for the mode's own settings.
const ArithmeticPage = async ({searchParams}: Props) => {
    const userId = await requireUserId();
    const {mode: param} = await searchParams;
    const mode: ArithmeticMode = isMode(param) ? param : 'sprint';
    const summary = mode === 'custom' ? null
        : mode === 'interview' ? await readGameSummary(userId, 'interview', 'interview')
            : await readGameSummary(userId, 'arithmetic', 'zetamac');

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-arithmetic-page={mode}>
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={ARITHMETIC_COPY.title} subtitle={ARITHMETIC_COPY.subtitle}/>
            <Tabs tabs={TABS} active={mode} label={ARITHMETIC_COPY.modeLabel}/>
            <Panel pad={6}>
                <ArithmeticGame key={mode} mode={mode} summary={summary}/>
            </Panel>
        </div>
    );
};

export default ArithmeticPage;
