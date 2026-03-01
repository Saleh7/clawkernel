'use client'

import { StickToBottom } from 'use-stick-to-bottom'
import { cn } from '@/lib/utils'

type ChatContainerRootProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

type ChatContainerContentProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

type ChatContainerScrollAnchorProps = {
  className?: string
  ref?: React.RefObject<HTMLDivElement>
} & React.HTMLAttributes<HTMLDivElement>

function ChatContainerRoot({ children, className, ...props }: ChatContainerRootProps) {
  return (
    <StickToBottom
      className={cn('flex overflow-y-auto overflow-x-hidden', className)}
      resize="smooth"
      initial="instant"
      role="log"
      {...props}
    >
      {children}
    </StickToBottom>
  )
}

function ChatContainerContent({ children, className, ...props }: ChatContainerContentProps) {
  return (
    <StickToBottom.Content className={cn('flex w-full flex-col min-w-0', className)} {...props}>
      {children}
    </StickToBottom.Content>
  )
}

function ChatContainerScrollAnchor({ className, ...props }: ChatContainerScrollAnchorProps) {
  return <div className={cn('h-px w-full shrink-0 scroll-mt-4', className)} aria-hidden="true" {...props} />
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor }
