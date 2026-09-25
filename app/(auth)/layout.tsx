import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";

const Layout = async ({children}:{children : React.ReactNode}) => {
    const session = await auth.api.getSession({headers: await headers()});
    // The dashboard, not /topics: topics are seeded at sign-up, so there is nothing to
    // set up and the default layout already leads with them.
    if(session?.user) redirect('/')
    return <AuthShell>{children}</AuthShell>;
}

export default Layout
