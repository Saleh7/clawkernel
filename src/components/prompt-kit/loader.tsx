'use client'

import { cn } from '@/lib/utils'

export function TypingLoader({
  className,
  size = 'md',
}: {
  readonly className?: string
  readonly size?: 'sm' | 'md' | 'lg'
}) {
  const dotSizes = {
    sm: 'h-1 w-1',
    md: 'h-1.5 w-1.5',
    lg: 'h-2 w-2',
  }

  const containerSizes = {
    sm: 'h-4',
    md: 'h-5',
    lg: 'h-6',
  }

  return (
    <div className={cn('flex items-center space-x-1', containerSizes[size], className)}>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn('bg-muted-foreground animate-[typing_1s_infinite] rounded-full', dotSizes[size])}
          style={{
            animationDelay: `${i * 250}ms`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function TextShimmerLoader({
  text = 'Thinking',
  className,
  size = 'md',
}: {
  readonly text?: string
  readonly className?: string
  readonly size?: 'sm' | 'md' | 'lg'
}) {
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <div
      className={cn(
        'bg-[linear-gradient(to_right,var(--muted-foreground)_40%,var(--foreground)_60%,var(--muted-foreground)_80%)]',
        'bg-[length:200%_auto] bg-clip-text font-medium text-transparent',
        'animate-[shimmer_4s_infinite_linear]',
        textSizes[size],
        className,
      )}
    >
      {text}
    </div>
  )
}
