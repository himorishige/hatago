/**
 * ランタイムユーティリティ - Vitestに依存しない実行用ヘルパー関数群
 */

import type { HatagoContext } from '@hatago/core'
import type { ExampleResult } from './types.js'

/**
 * モックコンテキストの作成（Vitestなし版）
 */
export const createRuntimeMockContext = (): HatagoContext => {
  const mockServer = {
    registerTool: (...args: any[]) => {
      console.log('Tool registered:', args[0])
    },
    registerResource: (...args: any[]) => {
      console.log('Resource registered:', args[0])
    },
  }

  const mockApp = {
    get: (...args: any[]) => {
      console.log('GET endpoint registered:', args[0])
    },
    post: (...args: any[]) => {
      console.log('POST endpoint registered:', args[0])
    },
    use: (..._args: any[]) => {
      console.log('Middleware registered')
    },
  }

  return {
    app: mockApp as any,
    server: mockServer as any,
    env: {},
    getBaseUrl: (_req: Request) => new URL('http://localhost:8787'),
  }
}

/**
 * 結果のテキスト形式フォーマット（純粋関数）
 */
export const formatResultAsText = (result: ExampleResult): string => {
  const statusIcon = result.success ? '✅' : '❌'
  const duration = result.duration ? `(${result.duration}ms)` : ''

  let output = `${statusIcon} ${result.success ? 'SUCCESS' : 'FAILURE'} ${duration}\n`

  // プラグイン名とモードが存在する場合のみ表示
  if (result.pluginName) {
    output += `Plugin: ${result.pluginName}\n`
  }
  if (result.mode) {
    output += `Mode: ${result.mode}\n`
  }

  if (result.output) {
    output += '\nOutput:\n'
    // オブジェクトの場合はJSONとして整形
    if (typeof result.output === 'object') {
      output += JSON.stringify(result.output, null, 2)
    } else {
      output += String(result.output)
    }
    output += '\n'
  }

  if (result.error) {
    output += `\nError: ${result.error}\n`
  }

  return output
}

/**
 * 結果のJSON形式フォーマット（純粋関数）
 */
export const formatResultAsJson = (result: ExampleResult): string => {
  return JSON.stringify(result, null, 2)
}

/**
 * タイムアウト付きPromise実行（純粋関数的な構造）
 */
export const withTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  return Promise.race([operation(), timeoutPromise])
}
