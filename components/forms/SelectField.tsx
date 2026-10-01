import {Label} from "@/components/ui/label";
import {Controller} from "react-hook-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type {Control, FieldError, FieldValues, Path} from 'react-hook-form';
import type {Option} from '@/components/forms/types';

// Generic over the form's values, so `name` must be one of its fields and `control` is that form's.
type SelectFieldProps<T extends FieldValues> = {
    name: Path<T>;
    label: string;
    placeholder: string;
    options: readonly Option[];
    control: Control<T>;
    error?: FieldError;
    required?: boolean;
};

const SelectField = <T extends FieldValues>({ name, label, placeholder, options, control, error, required = false }: SelectFieldProps<T>) => {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="form-label">{label}</Label>

            <Controller
                name={name}
                control={control}
                rules={{
                    required: required ? `Please select ${label.toLowerCase()}` : false,
                }}
                render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="select-trigger">
                            <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-600 text-fg">
                            {options.map((option) => (
                                <SelectItem value={option.value} key={option.value} className="focus:bg-gray-600 focus:text-fg">
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                        {error && <p className="text-sm text-red-500">{error.message}</p>}
                    </Select>
                )}
            />
        </div>
    )
}
export default SelectField
