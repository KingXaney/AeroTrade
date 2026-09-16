'use client';

import RouteError from "@/components/system/RouteError";

const Error = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError error={error} reset={reset}/>
);

export default Error;
