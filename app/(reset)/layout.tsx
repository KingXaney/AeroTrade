import AuthShell from "@/components/auth/AuthShell";

// Same chrome as (auth), minus its signed-in → /topics redirect: someone who is still
// signed in on this device must be able to finish resetting their password.
const Layout = ({children}: {children: React.ReactNode}) => <AuthShell>{children}</AuthShell>;

export default Layout;
