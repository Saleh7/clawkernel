import { ArrowDown, ArrowUp, Clock, Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTimeFormat } from '@/hooks/use-time-format'
import type { CronJob, CronJobsEnabledFilter, CronJobsSortBy, CronSortDir } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { CreateJobWizard } from './components/create-job-wizard'
import { CronStatsBar } from './components/cron-stats-bar'
import { JobCard } from './components/job-card'
import { JobEditForm } from './components/job-edit-form'
import { useCronJobs } from './hooks/use-cron-jobs'
import { useCronRuns } from './hooks/use-cron-runs'
import { ENABLED_FILTER_OPTIONS, SORT_BY_OPTIONS } from './types'

const log = createLogger('cron:page')

export default function CronPage() {
  const { is24h } = useTimeFormat()
  const [searchParams] = useSearchParams()
  const targetJobId = searchParams.get('job')
  const showMode = searchParams.get('show')

  const {
    jobs,
    total,
    hasMore,
    status,
    loading,
    loadingMore,
    query,
    enabledFilter,
    sortBy,
    sortDir,
    setQuery,
    setEnabledFilter,
    setSortBy,
    setSortDir,
    refresh,
    loadMore,
    client,
  } = useCronJobs()

  const runsHook = useCronRuns(client)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteJob, setDeleteJob] = useState<CronJob | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const didAutoExpand = useRef(false)

  useEffect(() => {
    if (didAutoExpand.current || loading || jobs.length === 0) return
    didAutoExpand.current = true

    let target: CronJob | undefined
    if (targetJobId) {
      target = jobs.find((j) => j.id === targetJobId)
    } else if (showMode === 'errors') {
      target = jobs.find((j) => j.state?.lastStatus === 'error')
    }

    if (target) {
      setExpandedId(target.id)
      runsHook.fetchRuns(target.id)
      setTimeout(() => {
        document.getElementById(`cron-job-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 200)
    }
  }, [loading, jobs, targetJobId, showMode, runsHook])

  const handleToggleExpand = useCallback(
    (jobId: string) => {
      if (expandedId === jobId) {
        setExpandedId(null)
        runsHook.clear()
      } else {
        setExpandedId(jobId)
        setEditingId(null)
        runsHook.fetchRuns(jobId)
      }
    },
    [expandedId, runsHook],
  )

  const handleEdit = useCallback((jobId: string) => {
    setEditingId((prev) => (prev === jobId ? null : jobId))
    setExpandedId(null)
  }, [])

  const handleDelete = async () => {
    if (!client || !deleteJob) return
    setDeleteLoading(true)
    try {
      await client.request('cron.remove', { id: deleteJob.id })
      toast.success('Job deleted')
      if (expandedId === deleteJob.id) setExpandedId(null)
      if (editingId === deleteJob.id) setEditingId(null)
      refresh()
    } catch (err) {
      log.warn('cron.remove failed', err)
      toast.error('Failed to delete job')
    }
    setDeleteLoading(false)
    setDeleteJob(null)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <PageHeader
        icon={Clock}
        title="Cron Jobs"
        description="Manage scheduled tasks across all agents"
        badge={`${total}`}
      >
        <Button className="gap-2" onClick={() => setWizardOpen(true)}>
          + New Job
        </Button>
      </PageHeader>

      {/* Stats bar */}
      <CronStatsBar status={status} jobs={jobs} total={total} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs…"
            className="pl-9 h-10"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {ENABLED_FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={enabledFilter === opt.value ? 'default' : 'outline'}
              className="h-10 px-4"
              onClick={() => setEnabledFilter(opt.value as CronJobsEnabledFilter)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as CronJobsSortBy)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {SORT_BY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <Button
          size="icon"
          variant="outline"
          className="h-10 w-10"
          onClick={() => setSortDir((d: CronSortDir) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Loading */}
      {loading && jobs.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-2xl bg-muted/50 p-6 mb-4">
            <Clock className="h-12 w-12 text-muted-foreground/30" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No cron jobs yet</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            Schedule tasks to run automatically — summarize news, send reports, or trigger any agent action on a timer.
          </p>
          <Button onClick={() => setWizardOpen(true)} className="gap-2">
            Create your first job
          </Button>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id}>
              <JobCard
                job={job}
                client={client}
                is24h={is24h}
                expanded={expandedId === job.id}
                focused={targetJobId === job.id}
                runs={expandedId === job.id ? runsHook.runs : []}
                runsTotal={expandedId === job.id ? runsHook.total : 0}
                runsHasMore={expandedId === job.id ? runsHook.hasMore : false}
                runsLoading={expandedId === job.id ? runsHook.loading : false}
                runsLoadingMore={expandedId === job.id ? runsHook.loadingMore : false}
                onToggleExpand={() => handleToggleExpand(job.id)}
                onEdit={() => handleEdit(job.id)}
                onDelete={() => setDeleteJob(job)}
                onRefreshRuns={() => runsHook.fetchRuns(job.id)}
                onLoadMoreRuns={runsHook.loadMore}
                onRefreshJobs={refresh}
              />
              {editingId === job.id && (
                <JobEditForm
                  job={job}
                  client={client}
                  is24h={is24h}
                  onClose={() => setEditingId(null)}
                  onSaved={refresh}
                />
              )}
            </div>
          ))}

          {hasMore && (
            <Button variant="outline" className="w-full gap-2 h-10" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Load more jobs
            </Button>
          )}
        </div>
      )}

      {/* Wizard */}
      <CreateJobWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        client={client}
        is24h={is24h}
        onCreated={refresh}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteJob !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteJob(null)
        }}
        title="Delete Cron Job"
        description={
          <>
            This will permanently delete <strong>{deleteJob?.name}</strong>.
          </>
        }
        confirmText={deleteJob?.name}
        actionLabel="Delete"
        loadingLabel="Deleting…"
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  )
}
