import Link from "next/link";
import {cn} from "@/lib/utils";
import {brandById} from "@/lib/culture/catalog";
import {brandEvidenceHref} from "@/lib/culture/links";

// The brands behind a row, as small links to each one's evidence: the other brands an item
// mentions, the brands that put a symbol in a picker's universe. An id the catalog no longer
// knows is skipped. Server-safe and client-safe: no hooks, no server imports.
type Props = {
    ids: readonly string[];
    // Names already known to the caller, when the ids come with them (a decision's brands).
    names?: Readonly<Record<string, string>>;
    className?: string;
};

const BrandChips = ({ids, names, className}: Props) => {
    const chips = ids.flatMap((id) => {
        const name = names?.[id] ?? brandById(id)?.name;
        return name ? [{id, name}] : [];
    });
    if (chips.length === 0) return null;
    return (
        <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-brand-chips>
            {chips.map((chip) => (
                <Link key={chip.id} href={brandEvidenceHref(chip.id)} className="font-mono text-[11px] text-brand hover:underline">
                    {chip.name}
                </Link>
            ))}
        </span>
    );
};

export default BrandChips;
