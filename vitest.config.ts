import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // テストファイルパターン
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'server/tests/**/*.test.ts',
      'server/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/.vercel/**',
      '**/.wrangler/**',
    ],

    // 環境設定
    environment: 'node',
    
    // グローバル設定
    globals: true,
    
    // TypeScript設定
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },

    // タイムアウト設定
    testTimeout: 10000,
    hookTimeout: 10000,

    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        '**/node_modules/**',
        '**/tests/**',
        '**/*.test.ts',
        '**/*.config.*',
        '**/types.ts',
        '**/index.ts',
        // 外部ライブラリとの境界
        '**/sdk/**',
        '**/generated/**',
      ],
      // 重要モジュールのカバレッジ目標
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        // セキュリティ・設定・Transport・MCPは高めの目標
        'packages/core/src/logger.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'packages/hono-mcp/src/streamableHttp.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'server/src/config/loader.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'server/src/plugins/enhanced-mcp-proxy.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // 並列実行設定
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
      },
    },

    // ログ設定
    logLevel: 'info',
    
    // レポーター設定
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json',
    },

    // 監視設定
    watch: false,
    
    // セットアップファイル
    setupFiles: ['./tests/setup.ts'],
  },

  // ESBuildの設定
  esbuild: {
    target: 'node18',
  },

  // 依存関係の最適化
  optimizeDeps: {
    include: ['vitest', '@vitest/ui'],
  },
})