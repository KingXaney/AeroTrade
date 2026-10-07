'use client';

// The table link as a QR code, for a phone camera across the room: uqr's module matrix drawn as one
// <rect> per run of dark modules (lib/poker-night/qr), filled with currentColor on a light square
// so it scans in every theme — a scanner wants dark modules on a light ground, whatever the
// palette, and the quiet zone is the code's own border. Loaded only when the invite shows it.

import {useMemo} from "react";
import {encode} from "uqr";
import {INVITE_COPY} from "@/lib/learn/copy/poker-night";
import {qrRuns} from "@/lib/poker-night/qr";

const QrCode = ({value}: {value: string}) => {
    const {size, runs} = useMemo(() => {
        const qr = encode(value, {ecc: 'M', border: 2});
        return {size: qr.size, runs: qrRuns(qr.data)};
    }, [value]);
    return (
        // Light ground and dark modules in every theme: a scanner reads nothing else reliably.
        <div className="inline-flex rounded-lg bg-white p-1 text-black" data-qr="">
            <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={INVITE_COPY.qrLabel} shapeRendering="crispEdges"
                 className="size-44 sm:size-48">
                {runs.map((r) => <rect key={`${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill="currentColor"/>)}
            </svg>
        </div>
    );
};

export default QrCode;
