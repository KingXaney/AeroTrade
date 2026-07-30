'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice} from "@/lib/utils";
import {placeOrder} from "@/lib/actions/trading.actions";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

// Sell dialog for one open position — pick how many shares to sell via free
// entry or 25/50/75/Max presets. Parents mount it conditionally per selected
// position, so every open starts with fresh state (qty defaults to Max).
const SellPositionDialog = ({position, accountId, onClose}: {position: EnrichedPosition; accountId: string; onClose: () => void}) => {
    const router = useRouter();
    const [qty, setQty] = useState(String(position.quantity));
    const [submitting, setSubmitting] = useState(false);

    const owned = position.quantity;
    const qtyNum = qty === '' ? 0 : parseInt(qty, 10);
    const valid = qtyNum >= 1 && qtyNum <= owned;
    const price = position.currentPrice;
    const estProceeds = typeof price === 'number' && qtyNum > 0 ? price * qtyNum : null;

    const presets = [
        {label: '25%', value: Math.max(1, Math.floor(owned * 0.25))},
        {label: '50%', value: Math.max(1, Math.floor(owned * 0.5))},
        {label: '75%', value: Math.max(1, Math.floor(owned * 0.75))},
        {label: 'Max', value: owned},
    ];

    const onConfirm = async () => {
        if (submitting || !valid) return;
        setSubmitting(true);
        try {
            const result = await placeOrder({symbol: position.symbol, side: 'sell', quantity: qtyNum, accountId});
            if (result.success) {
                toast.success(result.message || `Sold ${qtyNum} ${position.symbol}`);
                onClose();
                router.refresh();
            } else {
                toast.error(result.message || 'Sell failed');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
            <DialogContent className="bg-[#14171b] ring-[rgba(255,255,255,0.06)] sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-[0.1em] text-[#ffb4ab]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Sell {position.symbol}
                    </DialogTitle>
                    <DialogDescription className="text-[#849495]">
                        You own {owned} share{owned === 1 ? '' : 's'} of {position.company || position.symbol}.
                    </DialogDescription>
                </DialogHeader>

                <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onConfirm(); }}>
                    <div>
                        <label htmlFor="sell-qty" className="text-[10px] uppercase tracking-[0.1em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            Shares to sell
                        </label>
                        <input
                            id="sell-qty"
                            value={qty}
                            onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                            inputMode="numeric"
                            autoComplete="off"
                            className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                            style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
                        />
                        {qtyNum > owned && (
                            <p className="mt-1 text-xs text-[#ffb4ab]">You only own {owned} share{owned === 1 ? '' : 's'}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-4 gap-1 p-1 rounded-lg" style={{backgroundColor: '#1e2024'}}>
                        {presets.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => setQty(String(preset.value))}
                                className={cn(
                                    'py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                                    qtyNum === preset.value
                                        ? 'bg-[rgba(255,180,171,0.15)] text-[#ffb4ab]'
                                        : 'text-[#849495] hover:text-[#e2e2e8]',
                                )}
                                style={{fontFamily: 'var(--font-jetbrains)'}}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <span className="text-[#849495]">Live Price</span>
                        <span className="text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {typeof price === 'number' ? formatPrice(price) : '—'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t border-[rgba(59,73,75,0.3)] pt-3">
                        <span className="text-[#849495]">Est. Proceeds</span>
                        <span className="text-[#7df4ff] font-semibold" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {estProceeds !== null ? formatPrice(estProceeds) : '—'}
                        </span>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || !valid}
                        className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-[#690005]"
                        style={{
                            fontFamily: 'var(--font-jetbrains)',
                            backgroundColor: '#ffb4ab',
                            boxShadow: '0 0 15px rgba(255,180,171,0.25)',
                        }}
                    >
                        {submitting ? 'Selling…' : `Sell ${qtyNum || 0} share${qtyNum === 1 ? '' : 's'}`}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default SellPositionDialog;
