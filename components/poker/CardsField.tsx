'use client';

import {cardLabel, parseCardList} from "@/lib/poker/cards";
import {CARDS_COPY} from "@/lib/learn/copy/poker";
import MicroLabel from "@/components/primitives/MicroLabel";
import TextField from "@/components/primitives/TextField";

// A row of cards typed as text — the board or the dead cards — with what it could not read below.
type Props = {
    id: string;
    label: string;
    hint: string;
    placeholder: string;
    value: string;
    onChange: (text: string) => void;
};

const CardsField = ({id, label, hint, placeholder, value, onChange}: Props) => {
    const parsed = parseCardList(value);
    const problems = [...parsed.unknown.map(CARDS_COPY.unknown), ...parsed.repeated.map((card) => CARDS_COPY.repeated(cardLabel(card)))];
    return (
        <label className="block space-y-1">
            <MicroLabel as="span" className="block">{label}</MicroLabel>
            <TextField
                value={value}
                placeholder={placeholder}
                spellCheck={false}
                autoComplete="off"
                className="w-full"
                data-cards-field={id}
                onChange={(event) => onChange(event.target.value)}
            />
            <span className="block font-mono text-[10px] text-fg-muted">{hint}</span>
            {problems.length > 0 && (
                <span className="block space-y-0.5 text-xs text-warning" data-cards-issues={id}>
                    {problems.map((problem) => <span key={problem} className="block">{problem}</span>)}
                </span>
            )}
        </label>
    );
};

export default CardsField;
