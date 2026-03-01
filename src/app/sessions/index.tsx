import { Layers, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { PageHeader } from '@/components/page-header'
import { DeleteSessionDialog, HistoryDialog, PatchSessionDialog, SendMessageDialog } from '@/components/session-dialogs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import { SessionsControls } from './components/controls'
import { SessionsList } from './components/list'
import { SessionCard } from './components/session-card'
import { StatsBar } from './components/stats-bar'
import { BulkDeleteDialog } from './dialogs/bulk-delete-dialog'
import { useSessionsPage } from './hooks/use-sessions-page'

function SessionsSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader icon={Layers} title="Sessions" description="Manage active sessions" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export default function SessionsPage() {
  const page = useSessionsPage()

  const renderCard = useCallback(
    (session: GatewaySessionRow) => (
      <SessionCard
        key={session.key}
        session={session}
        isRunning={page.runningSessionKeys.has(session.key)}
        expanded={page.expandedKey === session.key}
        onToggle={() => page.setExpandedKey((prev) => (prev === session.key ? null : session.key))}
        bulkMode={page.bulkMode}
        selected={page.selected.has(session.key)}
        onSelect={page.toggleSelect}
        onHistory={page.setHistorySession}
        onSendMessage={page.setSendSession}
        onPatch={page.setPatchSession}
        onDelete={page.setDeleteSession}
        maxTokens={page.maxTokens}
      />
    ),
    [
      page.runningSessionKeys,
      page.expandedKey,
      page.bulkMode,
      page.selected,
      page.toggleSelect,
      page.maxTokens,
      page.setExpandedKey,
      page.setHistorySession,
      page.setSendSession,
      page.setPatchSession,
      page.setDeleteSession,
    ],
  )

  if (!page.connected) return <SessionsSkeleton />

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        icon={Layers}
        title="Sessions"
        description="Manage and monitor active sessions"
        badge={String(page.sessions.length)}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                aria-label="Refresh sessions"
                onClick={() => void page.refresh({ userInitiated: true })}
                disabled={page.refreshing}
              >
                <RefreshCw className={cn('h-4 w-4', page.refreshing && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh sessions</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PageHeader>

      <StatsBar sessions={page.sessions} />

      <SessionsControls
        quickFilter={page.quickFilter}
        setQuickFilter={page.setQuickFilter}
        quickCounts={page.quickCounts}
        autoRefresh={page.autoRefresh}
        setAutoRefresh={page.setAutoRefresh}
        gatewayLimit={page.gatewayLimit}
        setGatewayLimit={page.setGatewayLimit}
        search={page.search}
        setSearch={page.setSearch}
        sortField={page.sortField}
        sortDir={page.sortDir}
        onToggleSort={page.toggleSort}
        kindFilter={page.kindFilter}
        setKindFilter={page.setKindFilter}
        uniqueAgents={page.uniqueAgents}
        agentFilter={page.agentFilter}
        setAgentFilter={page.setAgentFilter}
        viewMode={page.viewMode}
        setViewMode={page.setViewMode}
        bulkMode={page.bulkMode}
        selectedCount={page.selected.size}
        visibleCount={page.visibleSessions.length}
        onToggleBulkMode={page.toggleBulkMode}
        onSelectVisible={page.selectVisible}
        onOpenBulkDelete={() => page.setShowBulkDelete(true)}
      />

      <SessionsList
        filtered={page.filtered}
        visibleSessions={page.visibleSessions}
        viewMode={page.viewMode}
        treeRoots={page.treeRoots}
        grouped={page.grouped}
        renderCard={renderCard}
        hasMoreSessions={page.hasMoreSessions}
        remainingSessions={page.remainingSessions}
        onShowMore={page.showMore}
        onShowAll={page.showAll}
        isFiltered={
          page.search.length > 0 ||
          page.kindFilter !== 'all' ||
          page.agentFilter !== 'all' ||
          page.quickFilter !== 'none'
        }
      />

      <HistoryDialog
        session={page.historySession}
        open={!!page.historySession}
        onOpenChange={(open) => !open && page.setHistorySession(null)}
      />
      <SendMessageDialog
        session={page.sendSession}
        open={!!page.sendSession}
        onOpenChange={(open) => !open && page.setSendSession(null)}
      />
      <PatchSessionDialog
        session={page.patchSession}
        open={!!page.patchSession}
        onOpenChange={(open) => !open && page.setPatchSession(null)}
        onPatched={() => void page.refresh()}
      />
      <DeleteSessionDialog
        session={page.deleteSession}
        open={!!page.deleteSession}
        onOpenChange={(open) => !open && page.setDeleteSession(null)}
        onDeleted={() => void page.refresh()}
      />
      <BulkDeleteDialog
        keys={Array.from(page.selected)}
        open={page.showBulkDelete}
        onClose={() => page.setShowBulkDelete(false)}
        onDone={({ failedKeys }) => {
          page.toggleBulkMode()
          if (failedKeys.length > 0) {
            // Keep failed keys selected for retry
          }
          void page.refresh()
        }}
      />
    </div>
  )
}
