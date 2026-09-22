'use client';

import RouteError from "@/components/system/RouteError";

const StrategiesError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError
        error={error}
        reset={reset}
        title="Quant Strategies"
        message="Couldn't load the strategy leaderboard. The daily run and price data may still be settling."
    />
);

export default StrategiesError;
