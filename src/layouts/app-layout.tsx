import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from 'sonner'
import { AppSidebar } from '@/components/app-sidebar'
import { ErrorBoundary } from '@/components/error-boundary'
import { PageSkeleton } from '@/components/page-skeleton'
import { StatusBar } from '@/components/status-bar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useChatToast } from '@/hooks/use-chat-toast'
import { useGateway } from '@/hooks/use-gateway'

export default function AppLayout() {
  useGateway()
  useChatToast()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <StatusBar />
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </SidebarInset>
      </SidebarProvider>
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  )
}
