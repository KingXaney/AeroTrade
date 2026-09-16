'use client';

import React, {memo, useMemo} from 'react';
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import {useThemeTokens} from "@/components/theme/ThemeProvider";
import {cn} from "@/lib/utils";

interface TradingViewWidgetProps {
    title?: string;
    scriptUrl: string;
    config: Record<string, unknown>;
    height?: number;
    className?: string;
}

const TradingViewWidget = ({title, scriptUrl, config, height = 600, className}: TradingViewWidgetProps) => {
    const {mode, surface0} = useThemeTokens();
    // Keyed on content: server pages rebuild equal config objects on every render and
    // a new identity would tear the embed down; a real theme change still re-embeds.
    const configKey = JSON.stringify(config);
    const themedConfig = useMemo(() => {
        const base = JSON.parse(configKey) as Record<string, unknown>;
        const transparent = base.isTransparent === true || base.isTransparent === 'true';
        if ('colorTheme' in base) base.colorTheme = mode;
        if ('theme' in base) base.theme = mode;
        if (!transparent && 'backgroundColor' in base) base.backgroundColor = surface0;
        if ('gridColor' in base) base.gridColor = surface0;
        return base;
    }, [configKey, mode, surface0]);

    const containerRef = useTradingViewWidget(scriptUrl, themedConfig, height);

    return (
        <div className="w-full">
            {title && (
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-fg"
                        style={{ fontFamily: 'var(--type-display)' }}>
                        {title}
                    </h3>
                    {/* No pulsing "LIVE": outside market hours the embed shows the last session. */}
                    <span className="text-[10px] text-fg-muted"
                          style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                        TRADINGVIEW
                    </span>
                </div>
            )}
            <div className={cn('tradingview-widget-container', className)} ref={containerRef}>
                <div className="tradingview-widget-container__widget" style={{height, width: "100%" }}/>
            </div>
        </div>
    );
}

export default memo(TradingViewWidget);
