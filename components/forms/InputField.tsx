import React from 'react'
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import type {FieldError, FieldValues, Path, RegisterOptions, UseFormRegister} from 'react-hook-form';

// Generic over the form's values, so `name` must be one of its fields and `register` is that form's.
type FormInputProps<T extends FieldValues> = {
    name: Path<T>;
    label: string;
    placeholder: string;
    type?: string;
    register: UseFormRegister<T>;
    error?: FieldError;
    validation?: RegisterOptions<T, Path<T>>;
    disabled?: boolean;
    value?: string;
};

const InputField = <T extends FieldValues>({ name, label, placeholder, type = "text", register, error, validation, disabled, value }: FormInputProps<T>) => {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="form-label">
                {label}
            </Label>
            <Input
                type={type}
                id={name}
                placeholder={placeholder}
                disabled={disabled}
                value={value}
                className={cn('form-input', { 'opacity-50 cursor-not-allowed': disabled })}
                {...register(name, validation)}
            />
            {error && <p className="text-sm text-red-500">{error.message}</p>}
        </div>
    )
}
export default InputField