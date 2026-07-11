import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

const fieldBase =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-ca-surface px-3.5 py-2.5 text-sm text-ca-ink placeholder:text-ca-ink-soft/60 transition-colors focus:border-ca-violet focus:outline-none focus:ring-2 focus:ring-ca-violet/20 disabled:cursor-not-allowed disabled:opacity-50";

const fieldErrorClass = "border-destructive focus:border-destructive focus:ring-destructive/20";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, error && fieldErrorClass, className)} {...props} />
  ),
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldBase, "resize-y", error && fieldErrorClass, className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, error && fieldErrorClass, className)} {...props} />
  ),
);
Select.displayName = "Select";
