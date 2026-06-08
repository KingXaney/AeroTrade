'use client';

import React, {memo} from 'react';
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import {cn} from "@/lib/utils";

interface TradingViewWidgetProps {
    title?: string;
    scriptUrl: string;
    config: Record<string, unknown>;
    height?: number;
    className?: string;
}

const TradingViewWidget = ({title, scriptUrl, config, height = 600, className}: TradingViewWidgetProps) => {
    const containerRef = useTradingViewWidget(scriptUrl, config, height);

    return (
        <div className="w-full">
            {title && (
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-[#e2e2e8]"
                        style={{ fontFamily: 'var(--font-sora)' }}>
                        {title}
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#7df4ff] animate-pulse"></div>
                        <span className="text-[10px] text-[#849495]"
                              style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                            LIVE
                        </span>
                    </div>
                </div>
            )}
            <div className={cn('tradingview-widget-container', className)} ref={containerRef}>
                <div className="tradingview-widget-container__widget" style={{height, width: "100%" }}/>
            </div>
        </div>
    );
}

export default memo(TradingViewWidget);
