'use client';

import {useTopicsUi} from "@/components/topics/TopicsShell";
import RefreshTopicButton from "@/components/topics/RefreshTopicButton";
import {refreshCooldownUntil} from "@/lib/topics/config";
import {pickStalestTopic} from "@/lib/topics/first-run";

const mono = {fontFamily: 'var(--type-mono)'} as const;

type Props = {now: number} & (   // now: the server render instant, for the refresh button's cooldown
    | {scope: 'topic'; topic: TopicOverviewItem}
    | {scope: 'all'; topics: TopicOverviewItem[]}
);

const secondary = "px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40";

// Empty feed for one topic or for the merged view. Both get real actions now: the
// merged version used to be text only, telling the user to wait for a job they had no
// way to trigger.
const TopicFeedEmpty = (props: Props) => {
    const {openComposer} = useTopicsUi();
    const target = props.scope === 'topic' ? props.topic : pickStalestTopic(props.topics);

    return (
        <section className="glass-panel rounded-xl p-8 text-center">
            <span className="material-symbols-outlined text-3xl text-fg-muted">manage_search</span>
            <h3 className="mt-2 text-base font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>No articles yet</h3>
            <p className="mt-1 text-sm text-fg-muted max-w-md mx-auto">
                {props.scope === 'topic'
                    ? 'We check for matches every few hours. Refresh now, or broaden the keywords if nothing turns up.'
                    : `Nothing has matched across your ${props.topics.length === 1 ? 'topic' : `${props.topics.length} topics`} yet. We check every few hours; refresh now or follow something broader.`}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2" style={mono}>
                {target && (
                    <RefreshTopicButton key={target.id} topicId={target.id} cooldownUntil={refreshCooldownUntil(target.refreshRequestedAt)}
                                        serverNow={props.now} variant="primary" />
                )}
                {props.scope === 'topic'
                    ? <button type="button" onClick={() => openComposer('edit', props.topic)} className={secondary}>Edit keywords</button>
                    : <button type="button" onClick={() => openComposer('create')} className={secondary}>Follow a topic</button>}
            </div>
            {props.scope === 'all' && target && props.topics.length > 1 && (
                <p className="mt-2 text-[11px] text-fg-muted" style={mono}>
                    Refreshes &ldquo;{target.name}&rdquo; — the topic that has waited longest.
                </p>
            )}
        </section>
    );
};

export default TopicFeedEmpty;
