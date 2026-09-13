'use client';

import {useState, useTransition} from "react";
import {Mail, Newspaper, Rss} from "lucide-react";
import {toast} from "sonner";
import {Switch} from "@/components/ui/switch";
import {setDigestMode, setTopicsInDigest, toggleEmailNotifications, type NotificationPreferences} from "@/lib/actions/preferences.actions";

const switchClass = "data-[state=checked]:!bg-brand-strong data-[state=unchecked]:!bg-surface-4 data-[state=unchecked]:!border data-[state=unchecked]:!border-line-strong transition-colors duration-200";

const NotificationSettings = ({initial}: {initial: NotificationPreferences}) => {
    const [emailEnabled, setEmailEnabled] = useState(initial.emailNotifications);
    const [personalizedDigest, setPersonalizedDigest] = useState(initial.digestMode === 'personalized');
    const [topicsInDigest, setTopicsInDigestState] = useState(initial.topicsInDigest);
    const [isPending, startTransition] = useTransition();

    const handleToggleEmail = (checked: boolean) => {
        // Optimistic update, reverted on failure.
        setEmailEnabled(checked);
        startTransition(async () => {
            const result = await toggleEmailNotifications(checked);
            if (result.success) {
                toast.success(checked ? 'Subscribed to the daily digest' : 'Unsubscribed from the daily digest');
            } else {
                setEmailEnabled(!checked);
                toast.error('Failed to update email preference');
            }
        });
    };

    const handleToggleDigestMode = (checked: boolean) => {
        setPersonalizedDigest(checked);
        startTransition(async () => {
            const result = await setDigestMode(checked ? 'personalized' : 'general');
            if (result.success) {
                toast.success(checked ? 'Digest now follows your holdings' : 'Switched to the general market digest');
            } else {
                setPersonalizedDigest(!checked);
                toast.error('Failed to update digest preference');
            }
        });
    };

    const handleToggleTopics = (checked: boolean) => {
        setTopicsInDigestState(checked);
        startTransition(async () => {
            const result = await setTopicsInDigest(checked);
            if (result.success) {
                toast.success(checked ? 'Your topics are back in the daily email' : 'Topics left out of the daily email');
            } else {
                setTopicsInDigestState(!checked);
                toast.error('Failed to update topics preference');
            }
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-line-strong/20 bg-surface-2/40 px-4 py-3">
                <div className="flex items-center gap-3">
                    <Mail className="size-4 text-fg-soft"/>
                    <div>
                        <div className="text-sm font-medium text-fg">Daily digest email</div>
                        <div className="text-[11px] text-fg-muted">Daily news & updates</div>
                    </div>
                </div>
                <Switch id="email-notifications-toggle" checked={emailEnabled} onCheckedChange={handleToggleEmail} disabled={isPending} className={switchClass}/>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line-strong/20 bg-surface-2/40 px-4 py-3">
                <div className="flex items-center gap-3">
                    <Newspaper className="size-4 text-fg-soft"/>
                    <div>
                        <div className="text-sm font-medium text-fg">Holdings-aware digest</div>
                        <div className="text-[11px] text-fg-muted">
                            {personalizedDigest ? 'News follows your positions & watchlist' : 'General market news for everyone'}
                        </div>
                    </div>
                </div>
                <Switch id="digest-mode-toggle" checked={personalizedDigest} onCheckedChange={handleToggleDigestMode} disabled={isPending || !emailEnabled} className={switchClass}/>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line-strong/20 bg-surface-2/40 px-4 py-3">
                <div className="flex items-center gap-3">
                    <Rss className="size-4 text-fg-soft"/>
                    <div>
                        <div className="text-sm font-medium text-fg">Topics in the daily email</div>
                        <div className="text-[11px] text-fg-muted">
                            {topicsInDigest ? 'A "Your topics" section with briefs and top headlines' : 'Only the market digest is sent'}
                        </div>
                    </div>
                </div>
                <Switch id="topics-digest-toggle" checked={topicsInDigest} onCheckedChange={handleToggleTopics} disabled={isPending || !emailEnabled} className={switchClass}/>
            </div>
        </div>
    );
};

export default NotificationSettings;
