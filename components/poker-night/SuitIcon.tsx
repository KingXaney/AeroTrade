// A suit as a small drawing in the current colour (the card's suit colour, from LOOKS_CSS through
// [data-suit]): never a glyph that a platform might draw as an emoji. Decorative: the card it sits
// on carries the name.

import type {SuitLetter} from "@/lib/poker-night/looks";

const PATHS: Record<SuitLetter, string> = {
    c: 'M12 2.4a4.3 4.3 0 0 0-3.7 6.5 4.3 4.3 0 1 0 2.4 7.3c-.2 2.1-1 3.8-2.3 5.4h7.2c-1.3-1.6-2.1-3.3-2.3-5.4a4.3 4.3 0 1 0 2.4-7.3A4.3 4.3 0 0 0 12 2.4z',
    d: 'M12 1.8 19.4 12 12 22.2 4.6 12z',
    h: 'M12 21.3S3.6 16 2.2 10.6C1.2 6.8 3.6 3.6 7 3.6c2.2 0 3.9 1.3 5 3 1.1-1.7 2.8-3 5-3 3.4 0 5.8 3.2 4.8 7C20.4 16 12 21.3 12 21.3z',
    s: 'M12 1.9C9.6 5.4 3.6 8.8 3.6 13.4c0 2.7 2.1 4.6 4.6 4.6 1.3 0 2.4-.5 3.2-1.3-.3 2-1.1 3.6-2.4 5.3h6c-1.3-1.7-2.1-3.3-2.4-5.3.8.8 1.9 1.3 3.2 1.3 2.5 0 4.6-1.9 4.6-4.6 0-4.6-6-8-8.4-11.5z',
};

const SuitIcon = ({suit, className}: {suit: SuitLetter; className?: string}) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <path d={PATHS[suit]} fill="currentColor"/>
    </svg>
);

export default SuitIcon;
