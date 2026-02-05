

import type { ComponentPropsWithoutRef } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "framer-motion";
import { cn } from "@/lib/utils"


type MotionButtonProps = ComponentPropsWithoutRef<typeof motion.button>;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm: "h-8 px-3 py-1.5 text-sm rounded-md gap-1.5",
        lg: "h-10 px-6 py-2 text-base rounded-md",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export default function Button(
  {
    className,
    variant,
    size,
    ...props
  }: MotionButtonProps &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
  }) {

  // Check if device supports hover (desktop) vs touch-only (mobile)
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  return (
    <motion.button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      whileHover={supportsHover ? { scale: 1.02 } : undefined}
      whileTap={{ scale: 0.95 }}
      {...props}
    />
  );
}

export { Button, buttonVariants }
