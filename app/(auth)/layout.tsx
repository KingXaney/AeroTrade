import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";

const Layout = async ({children}:{children : React.ReactNode}) => {
    const session = await auth.api.getSession({headers: await headers()});
    if(session?.user) redirect('/topics')
    return <AuthShell>{children}</AuthShell>;
}

export default Layout
