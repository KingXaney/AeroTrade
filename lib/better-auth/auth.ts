import { betterAuth } from "better-auth";
import { mongodbAdapter} from "better-auth/adapters/mongodb";
import { connectToDatabase} from "@/database/mongoose";
import { nextCookies} from "better-auth/next-js";
import { after } from "next/server";
import { sendPasswordResetEmail } from "@/lib/nodemailer";

function createAuthInstance(db: Parameters<typeof mongodbAdapter>[0]) {
    return betterAuth({
        database: mongodbAdapter(db),
        secret: process.env.BETTER_AUTH_SECRET,
        baseURL: process.env.BETTER_AUTH_URL,
        emailAndPassword: {
            enabled: true,
            disableSignUp: false,
            requireEmailVerification: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            autoSignIn: true,
            resetPasswordTokenExpiresIn: 30 * 60,
            revokeSessionsOnPasswordReset: true,
            // better-auth also passes a `url` here, pointing at /reset-password/<token> —
            // an auth *route handler* this app deliberately does not serve (auth runs
            // through server actions only). The email is built from the raw token.
            // Deferred past the response: with SMTP configured a known address would
            // otherwise answer a Gmail round-trip later than an unknown one — a timing
            // oracle that undoes the identical message the action returns.
            sendResetPassword: async ({user, token}) => {
                after(() => sendPasswordResetEmail({email: user.email, name: user.name, token})
                    .catch((error) => console.error('Password reset email failed', error)));
            },
        },
        session: {
            // Keep users signed in for 30 days...
            expiresIn: 60 * 60 * 24 * 30,
            // ...and slide that expiry forward at most once per day of activity,
            // so anyone who visits regularly effectively never gets logged out.
            updateAge: 60 * 60 * 24,
        },
        // NOTE: this only runs inside better-auth's HTTP router, which this app bypasses
        // (every call goes through auth.api.* from a server action) — so it limits
        // nothing here. The password-reset action uses lib/auth/rate-limit.ts instead;
        // applying that to sign-in is a follow-up.
        rateLimit: {
            enabled: true,
            storage: 'database',
        },
        plugins: [nextCookies()],
    });
}

let authInstance: ReturnType<typeof createAuthInstance> | null = null;

export const getAuth = async () => {
    if(authInstance) return authInstance;

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if(!db) throw new Error('MongoDB connection not found');

    authInstance = createAuthInstance(db);

    return authInstance;
}

export const auth = await getAuth();