import { Suspense } from 'react'
import { RouterProvider } from 'react-router'
import { router } from '@/router'

function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
