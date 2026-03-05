import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      // Whitelist: only files with testable business logic.
      // New logic files must be added here to be tracked.
      include: [
        'src/lib/cron.ts',
        'src/lib/format.ts',
        'src/lib/agent-status.ts',
        'src/lib/text-direction.ts',
        'src/lib/gateway/client.ts',
        'src/lib/gateway/device-auth.ts',
        'src/stores/gateway-store.ts',
        'src/app/chat/utils.ts',
        'src/app/chat/hooks/use-chat.ts',
        'src/app/sessions/utils.ts',
        'src/app/agents/utils.ts',
        'src/app/agents/tool-policy.ts',
        'src/app/agents/config-utils.ts',
        'src/app/agents/cron-utils.ts',
      ],
    },
  },
})
