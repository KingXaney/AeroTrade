'use client';

// PLO's board count, under the game when PLO is picked: one to three boards as far as this deploy
// deals them (lib/poker-night/lobby boardChoices), three 44 px choices side by side, each named "One
// board", "2 boards" and so on (MODE_COPY.boardsValue), with what more boards do in a line under
// them. Nothing for a game with one board only. The lobby's start form and the host drawer's Game
// section both draw it; a change there applies from the next hand.

import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import MicroLabel from "@/components/primitives/MicroLabel";
import {MODE_COPY} from "@/lib/learn/copy/poker-night";
import {boardChoices} from "@/lib/poker-night/lobby";
import type {BoardCount, Variant} from "@/lib/poker-night/types";

type BoardId = '1' | '2' | '3';

type Props = {
    variant: Variant;
    value: BoardCount;
    onChange: (boards: BoardCount) => void;
    hook: string; // data-pn-choice on the group
    disabled?: boolean;
};

const BoardsChoice = ({variant, value, onChange, hook, disabled = false}: Props) => {
    const choices = boardChoices(variant);
    if (choices.length < 2) return null;
    const ids = choices.map((n) => String(n) as BoardId);
    return (
        <div className="space-y-1.5" data-field="boards">
            <MicroLabel as="p">{MODE_COPY.boardsLabel}</MicroLabel>
            <ChoiceGroup<BoardId>
                label={MODE_COPY.boardsLabel}
                ids={ids}
                value={String(value) as BoardId}
                onChange={(id) => onChange(Number(id) as BoardCount)}
                name={(id) => MODE_COPY.boardsValue(Number(id))}
                disabled={disabled}
                className="grid grid-cols-3 gap-2"
                optionClassName="border border-line-strong/40 text-sm font-medium text-fg"
                hook={hook}
                render={(id) => <span aria-hidden="true">{id}</span>}
            />
            <p className="text-[11px] leading-relaxed text-fg-muted">{MODE_COPY.boardsHint}</p>
        </div>
    );
};

export default BoardsChoice;
