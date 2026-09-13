'use client';

import {useState} from "react";
import {useForm} from 'react-hook-form';
import {Button} from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import {requestPasswordReset} from "@/lib/actions/auth.actions";

type ForgotPasswordFormData = {email: string};

const ForgotPassword = () => {
    const [message, setMessage] = useState<string | null>(null);
    const {register, handleSubmit, formState: {errors, isSubmitting}} = useForm<ForgotPasswordFormData>({
        defaultValues: {email: ''},
        mode: 'onBlur',
    });

    // The server answers the same way for every address; the UI never gets to hint
    // whether an account exists.
    const onSubmit = async (data: ForgotPasswordFormData) => {
        const result = await requestPasswordReset(data);
        setMessage(result.message);
    };

    return (
        <>
            <h1 className="form-title">Reset your password</h1>

            {message ? (
                <div className="space-y-5">
                    <p role="status" className="text-sm text-fg">{message}</p>
                    <p className="text-sm text-fg-muted">Didn&apos;t get it? Check the address and your spam folder before requesting another.</p>
                    <FooterLink text="Remembered it?" linkText="Back to sign in" href="/sign-in" />
                </div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <p className="text-sm text-fg-muted -mt-6">Enter the email you signed up with and we&apos;ll send a link to choose a new password.</p>
                    <InputField
                        name="email"
                        label="Email"
                        placeholder="you@example.com"
                        register={register}
                        error={errors.email}
                        validation={{required: 'Email is required', pattern: {value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address'}}}
                    />
                    <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                        {isSubmitting ? 'Sending' : 'Send reset link'}
                    </Button>
                    <FooterLink text="Remembered it?" linkText="Back to sign in" href="/sign-in" />
                </form>
            )}
        </>
    );
};

export default ForgotPassword;
