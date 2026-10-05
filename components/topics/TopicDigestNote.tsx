import Link from "next/link";
import {Mail} from "lucide-react";
import {TOPICS_MANAGE_COPY} from "@/lib/learn/copy/topics";
import RowCard from "@/components/primitives/RowCard";

const TopicDigestNote = () => (
    <RowCard className="flex items-start gap-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-fg-soft">{TOPICS_MANAGE_COPY.digestNote}</p>
            <Link href="/settings?tab=notifications" className="label-type mt-1.5 inline-flex text-xs text-brand hover:underline">
                {TOPICS_MANAGE_COPY.digestSettings} →
            </Link>
        </div>
    </RowCard>
);

export default TopicDigestNote;
