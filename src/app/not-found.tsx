import { ArrowLeft, Ghost } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <main className="flex flex-1 items-center justify-center p-3 sm:p-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="flex flex-col items-center justify-center px-8 py-12 sm:px-12 sm:py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted sm:h-16 sm:w-16">
            <Ghost className="h-7 w-7 text-muted-foreground sm:h-8 sm:w-8" />
          </div>
          <h2 className="mt-4 font-mono text-3xl font-bold sm:mt-5 sm:text-4xl">404</h2>
          <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">Page not found</p>
          <Button variant="outline" size="sm" className="mt-5 sm:mt-6" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1.5 h-3 w-3" />
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
