import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "ca-btn-interactive inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "ca-btn-primary",
        lime: "ca-btn-lime",
        outline: "border border-ca-ink/[0.14] bg-transparent text-ca-ink hover:bg-ca-bg-soft",
        ghost: "bg-transparent text-ca-ink hover:bg-ca-bg-soft",
        destructive: "bg-destructive text-white hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
