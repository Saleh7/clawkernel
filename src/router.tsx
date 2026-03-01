import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { PageErrorBoundary } from '@/components/page-error-boundary'
import { RouteError } from '@/components/route-error'
import AppLayout from '@/layouts/app-layout'

const Dashboard = lazy(() => import('@/app/dashboard'))
const Chat = lazy(() => import('@/app/chat'))
const Agents = lazy(() => import('@/app/agents'))
const Sessions = lazy(() => import('@/app/sessions'))
const Channels = lazy(() => import('@/app/channels'))

const NotFound = lazy(() => import('@/app/not-found'))

function withBoundary(page: string, Component: React.ComponentType) {
  return (
    <PageErrorBoundary page={page}>
      <Component />
    </PageErrorBoundary>
  )
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: withBoundary('dashboard', Dashboard) },
      { path: 'chat', element: withBoundary('chat', Chat) },
      { path: 'agents', element: withBoundary('agents', Agents) },
      { path: 'sessions', element: withBoundary('sessions', Sessions) },
      { path: 'channels', element: withBoundary('channels', Channels) },

      { path: '*', element: <NotFound /> },
    ],
  },
])
