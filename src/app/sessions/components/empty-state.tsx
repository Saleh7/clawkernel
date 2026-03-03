import { Inbox } from 'lucide-react'

export function EmptyState({ filtered }: { readonly filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-2xl bg-muted/50 p-6 mb-4">
        <Inbox className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <h3 className="text-lg font-semibold">{filtered ? 'No matching sessions' : 'No sessions'}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {filtered ? 'Try adjusting your search or filters' : 'Sessions will appear here when agents are active'}
      </p>
    </div>
  )
}
