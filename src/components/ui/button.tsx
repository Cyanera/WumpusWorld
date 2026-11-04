import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 select-none',
  {
    variants: {
      variant: { default: 'bg-amber-500 text-black hover:bg-amber-400', secondary: 'bg-cave-700 text-white hover:bg-cave-600', outline: 'border border-cave-600 bg-transparent text-white hover:bg-cave-800', ghost: 'hover:bg-cave-800 text-white', danger: 'bg-red-600 text-white hover:bg-red-500', success: 'bg-emerald-600 text-white hover:bg-emerald-500' },
      size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-base', lg: 'h-14 px-5 text-lg', icon: 'h-10 w-10' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...p }, ref) => (
  <button ref={ref} className={cn(variants({ variant, size }), className)} {...p} />
));
Button.displayName = 'Button';
