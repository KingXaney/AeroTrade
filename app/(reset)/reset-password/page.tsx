import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

type ResetPasswordPageProps = {searchParams: Promise<{token?: string}>};

// The emailed link is /reset-password?token=…, built from the raw token in
// lib/nodemailer — better-auth's own `url` points at an auth route handler this app
// deliberately does not serve.
const ResetPasswordPage = async ({searchParams}: ResetPasswordPageProps) => {
    const {token} = await searchParams;
    return <ResetPasswordForm token={typeof token === 'string' && token.length > 0 ? token : null} />;
};

export default ResetPasswordPage;
