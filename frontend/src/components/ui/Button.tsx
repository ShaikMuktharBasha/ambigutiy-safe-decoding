import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas hover:bg-[#34322d] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
  accent: "bg-accent text-white hover:bg-accent-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
  secondary: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-white",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  danger: "text-rejected-ink hover:bg-rejected-soft",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 rounded-md px-2 text-xs",
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-8 rounded-lg",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-(--ease-soft)",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
