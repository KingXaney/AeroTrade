import { betterAuth } from "better-auth";
import { mongodbAdapter} from "better-auth/adapters/mongodb";
import { connectToDatabase} from "@/database/mongoose";
import { nextCookies} from "better-auth/next-js";

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
        },
        session: {
            // Keep users signed in for 30 days...
            expiresIn: 60 * 60 * 24 * 30,
            // ...and slide that expiry forward at most once per day of activity,
            // so anyone who visits regularly effectively never gets logged out.
            updateAge: 60 * 60 * 24,
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