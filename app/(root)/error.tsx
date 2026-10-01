'use client';

import RouteError from "@/components/shell/RouteError";

const Error = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError error={error} reset={reset}/>
);

export default Error;
