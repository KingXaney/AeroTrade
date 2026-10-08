'use client';

// The rebuy policy as two choices side by side, Off and On (the host approves), each a 44 px radio
// with its name, and one line under them saying what the host's yes covers: once the first hand is
// dealt every buy but the host's own waits for it, whatever the policy; off, a player who leaves or
// runs out can only watch. The lobby's start form and the host drawer's Rebuys section both draw it.

import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import {HOST_COPY} from "@/lib/learn/copy/poker-night";
import type {RebuyPolicy} from "@/lib/poker-night/types";

// Off first, as the words read: "Off / On".
const ORDER: readonly RebuyPolicy[] = ['off', 'approve'];

type Props = {
    value: RebuyPolicy;
    onChange: (policy: RebuyPolicy) => void;
    hintId: string;
    hook: string; // data-pn-choice on the group
    disabled?: boolean;
};

const RebuyChoice = ({value, onChange, hintId, hook, disabled = false}: Props) => (
    <div className="space-y-1.5">
        <ChoiceGroup<RebuyPolicy>
            label={HOST_COPY.rebuys}
            ids={ORDER}
            value={value}
            onChange={onChange}
            name={(policy) => HOST_COPY.rebuysValue[policy]}
            disabled={disabled}
            className="grid grid-cols-2 gap-2"
            optionClassName="border border-line-strong/40 px-3 text-sm text-fg"
            hook={hook}
            render={(policy) => <span>{HOST_COPY.rebuysValue[policy]}</span>}
        />
        <p id={hintId} className="text-[11px] leading-relaxed text-fg-muted">{HOST_COPY.rebuysHint}</p>
    </div>
);

export default RebuyChoice;
