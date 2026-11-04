import * as React from 'react';
import { cn } from '@/lib/utils';
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => <div ref={ref} className={cn('rounded-2xl border border-cave-700 bg-cave-900/90 shadow-lg', className)} {...p} />);
Card.displayName = 'Card';
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-4 pt-4', className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-base font-bold tracking-tight', className)} {...p} />;
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-4', className)} {...p} />;
