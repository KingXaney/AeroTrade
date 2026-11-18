'use client';
import {useEffect, useRef} from "react";


// A null height is one the caller does not know yet (the trade desk's follows the viewport, which
// the server cannot see): nothing is embedded until it is a number, so an embed is never built at
// one height and torn down for another.
function useTradingViewWidget(scriptUrl: string, config: Record<string, unknown>, height: number | null = 600) {
   const containerRef = useRef<HTMLDivElement | null>(null);
    useEffect(

        () => {
            const container = containerRef.current;
            if(!container) return;
            if(height === null) return;
            if(container.dataset.loaded) return;
            container.innerHTML = `<div class="tradingview-widget-container__widget" style="width: 100%; height: ${height}px;"></div>`;

            const script = document.createElement("script");
                script.src = scriptUrl;
                script.async = true;
                script.innerHTML = JSON.stringify({
                    ...config,
                    height,
                    width: "100%",
                });

                container.appendChild(script);
                container.dataset.loaded = 'true';

                return () => {
                    container.innerHTML = '';
                    delete container.dataset.loaded;
                }
        },
        [scriptUrl, config, height])

   return containerRef;
}

export default useTradingViewWidget
