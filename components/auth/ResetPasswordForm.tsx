'use client';

import {useForm} from 'react-hook-form';
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Button} from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import {resetPassword} from "@/lib/actions/auth.actions";

type ResetPasswordFormData = {password: string; confirm: string};

const ResetPasswordForm = ({token}: {token: string | null}) => {
    const router = useRouter();
    const {register, handleSubmit, getValues, formState: {errors, isSubmitting}} = useForm<ResetPasswordFormData>({
        defaultValues: {password: '', confirm: ''},
        mode: 'onBlur',
    });

    if (!token) {
        return (
            <>
                <h1 className="form-title">Reset your password</h1>
                <p role="alert" className="text-sm text-fg">This link is missing its reset token. Open the link from the email again, or request a new one.</p>
                <FooterLink text="Need a new link?" linkText="Request one" href="/forgot-password" />
            </>
        );
    }

    const onSubmit = async (data: ResetPasswordFormData) => {
        const result = await resetPassword({token, newPassword: data.password});
        if (result.success) {
            toast.success('Password updated — sign in with your new password');
            router.push('/sign-in');
            return;
        }
        toast.error('Could not reset your password', {description: result.error});
    };

    return (
        <>
            <h1 className="form-title">Choose a new password</h1>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <InputField
                    name="password"
                    label="New password"
                    placeholder="At least 8 characters"
                    type="password"
                    register={register}
                    error={errors.password}
                    validation={{required: 'Password is required', minLength: {value: 8, message: 'Password must be at least 8 characters'}, maxLength: {value: 128, message: 'Password must be at most 128 characters'}}}
                />
                <InputField
                    name="confirm"
                    label="Confirm new password"
                    placeholder="Type it again"
                    type="password"
                    register={register}
                    error={errors.confirm}
                    validation={{required: 'Please confirm your password', validate: (value: string) => value === getValues('password') || 'Passwords do not match'}}
                />
                <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                    {isSubmitting ? 'Saving' : 'Set new password'}
                </Button>
                <FooterLink text="Link expired?" linkText="Request a new one" href="/forgot-password" />
            </form>
        </>
    );
};

export default ResetPasswordForm;
