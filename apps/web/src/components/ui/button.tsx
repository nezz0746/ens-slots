"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-ink",
        secondary: "bg-brand-soft text-brand-ink hover:bg-brand-soft/70",
        outline: "border border-line bg-surface text-ink hover:bg-canvas",
        ghost: "text-ink-soft hover:bg-canvas hover:text-ink",
        danger: "bg-hot-soft text-hot hover:bg-hot-soft/70",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof button>) {
  return (
    <button className={cn(button({ variant, size }), className)} {...props} />
  );
}
