// The sign-in and sign-up forms' values, and the signed-in User the shell renders.

export type SignInFormData = {
    email: string;
    password: string;
};

export type SignUpFormData = {
    fullName: string;
    email: string;
    password: string;
    country: string;
    investmentGoals: string;
    riskTolerance: string;
    preferredIndustry: string;
};

export type User = {
    id: string;
    name: string;
    email: string;
};
