import RouteLoading from "@/components/shell/RouteLoading";

const NewsLoading = () => (
    <RouteLoading
        title="News"
        subtitle="Loading your feed…"
        lead={72}
        panels={6}
        columns="md:grid-cols-2 xl:grid-cols-3"
    />
);

export default NewsLoading;
