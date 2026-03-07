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
const Cron = lazy(() => import('@/app/cron'))
const Usage = lazy(() => import('@/app/usage'))
const Skills = lazy(() => import('@/app/skills'))
const Models = lazy(() => import('@/app/models'))
const Audio = lazy(() => import('@/app/audio'))
const Browser = lazy(() => import('@/app/browser'))
const Search = lazy(() => import('@/app/search'))

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
      { path: 'cron', element: withBoundary('cron', Cron) },
      { path: 'usage', element: withBoundary('usage', Usage) },
      { path: 'skills', element: withBoundary('skills', Skills) },
      { path: 'models', element: withBoundary('models', Models) },
      { path: 'audio', element: withBoundary('audio', Audio) },
      { path: 'browser', element: withBoundary('browser', Browser) },
      { path: 'search', element: withBoundary('search', Search) },

      { path: '*', element: <NotFound /> },
    ],
  },
])
