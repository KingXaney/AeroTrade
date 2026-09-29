'use client';

import {askAdvisor, buildAskPrompt, type AskInput} from "@/lib/chat/ask";

// The one "Ask in chat" affordance. It lives only inside a "What these mean" row or a
// "What the rule saw" disclosure — never on a bare row or tile — and it prefills the
// composer without sending, so a click spends nothing until the reader presses Send.

const AskLink = ({input, className}: {input: AskInput; className?: string}) => (
    <button
        type="button"
        data-ask={input.kind}
        onClick={() => askAdvisor(buildAskPrompt(input))}
        className={className ?? 'font-mono text-[10px] text-brand hover:underline'}
    >
        Ask in chat
    </button>
);

export default AskLink;
