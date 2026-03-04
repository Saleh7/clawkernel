import { Skeleton } from '@/components/ui/skeleton'

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_unused, n) => `page-skeleton-${n + 1}`).map((id) => (
          <Skeleton key={id} className="h-[120px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-[400px] rounded-lg lg:col-span-2" />
        <Skeleton className="h-[400px] rounded-lg lg:col-span-3" />
      </div>
      <Skeleton className="h-[200px] rounded-lg" />
    </div>
  )
}
