import Link from "next/link";
import {NAV_ITEMS} from "@/lib/shell/navigation";
import {rowCard} from "@/components/primitives/RowCard";

// Every route except the dashboard itself — you are already on it.
const LINKS = NAV_ITEMS.filter((i) => i.href !== '/');

const QuickLinks = () => (
    <div className="grid grid-cols-3 gap-2">
        {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
                  className={rowCard({className: 'flex flex-col items-center gap-1.5 px-2 py-3 text-fg-soft hover:text-brand hover:border-brand/40 transition-colors'})}>
                <span className="material-symbols-outlined">{l.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{fontFamily: 'var(--type-mono)'}}>{l.label}</span>
            </Link>
        ))}
    </div>
);

export default QuickLinks;
