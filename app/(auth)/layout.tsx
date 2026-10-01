import {getSessionUser} from "@/lib/auth/session";
import {redirect} from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";

const Layout = async ({children}:{children : React.ReactNode}) => {
    const user = await getSessionUser();
    // The dashboard, not /topics: topics are seeded at sign-up, so there is nothing to
    // set up and the default layout already leads with them.
    if(user) redirect('/')
    return <AuthShell>{children}</AuthShell>;
}

export default Layout
