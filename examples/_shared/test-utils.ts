/**
 * テストユーティリティ - 関数型プログラミングを重視したヘルパー関数群
 */

import { vi } from 'vitest'
import type { HatagoContext } from '@hatago/core'
import type { LogEntry, ExampleResult, TestScenario } from './types.js'

/**
 * フェイクタイマーを使用した決定的な時間制御
 */
export const withFakeTimers = <T>(fn: () => T): T => {
  vi.useFakeTimers()
  try {
    const result = fn()
    return result
  } finally {
    vi.useRealTimers()
  }
}

/**
 * モックコンテキストの作成（不変）
 */
export const createMockContext = (): HatagoContext => {
  const tools = new Map()
  const routes = new Map()
  
  return {
    app: {
      get: vi.fn((path, handler) => routes.set(`GET:${path}`, handler)),
      post: vi.fn((path, handler) => routes.set(`POST:${path}`, handler)),
      use: vi.fn()
    } as any,
    server: {
      registerTool: vi.fn((name, schema, handler) => tools.set(name, { schema, handler })),
      notification: vi.fn()
    } as any,
    env: {},
    getBaseUrl: vi.fn(() => new URL('http://localhost:8787'))
  }
}

/**
 * ログエントリーのスナップショット正規化（純粋関数）
 */
export const normalizeLogEntry = (entry: LogEntry): LogEntry => ({
  ...entry,
  // タイムスタンプを固定値に置換
  timestamp: entry.timestamp ? '2024-01-01T00:00:00.000Z' : undefined
})

/**
 * 機密情報のマスキング（純粋関数）
 */
export const maskSensitiveData = (data: unknown): unknown => {
  if (typeof data === 'string') {
    // PII パターンのマスキング
    return data
      .replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/g, '***@***.***') // Email
      .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '****-****-****-****') // Card numbers
      .replace(/\b[A-Za-z0-9]{32,}\b/g, '***TOKEN***') // API tokens
  }
  
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        // 機密情報のキーをマスクする
        /password|secret|token|key|auth/i.test(key) 
          ? '***MASKED***' 
          : maskSensitiveData(value)
      ])
    )
  }
  
  return data
}

/**
 * エラーの正規化（純粋関数）
 */
export const normalizeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * テストシナリオの実行（副作用を分離）
 */
export const runTestScenario = async (
  scenario: TestScenario,
  executeFunction: (input: unknown) => Promise<unknown>
): Promise<ExampleResult> => {
  const startTime = Date.now()
  
  try {
    const output = await executeFunction(scenario.input)
    const duration = Date.now() - startTime
    
    if (scenario.shouldFail) {
      return {
        success: false,
        output,
        duration,
        error: 'Expected scenario to fail but it succeeded'
      }
    }
    
    return {
      success: true,
      output,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    
    if (scenario.shouldFail) {
      return {
        success: true,
        output: null,
        duration
      }
    }
    
    return {
      success: false,
      output: null,
      duration,
      error: normalizeError(error)
    }
  }
}

/**
 * 結果のJSONフォーマット（純粋関数）
 */
export const formatResultAsJson = (result: ExampleResult): string => {
  return JSON.stringify(result, null, 2)
}

/**
 * 結果の人間可読フォーマット（純粋関数）
 */
export const formatResultAsText = (result: ExampleResult): string => {
  const status = result.success ? '✅ SUCCESS' : '❌ FAILED'
  const duration = `${result.duration}ms`
  
  let output = `${status} (${duration})\n`
  
  if (result.error) {
    output += `Error: ${result.error}\n`
  }
  
  if (result.output !== null && result.output !== undefined) {
    output += `Output: ${JSON.stringify(result.output, null, 2)}\n`
  }
  
  return output
}

/**
 * 配列の安全な操作（不変性を保証）
 */
export const safeMap = <T, R>(
  array: ReadonlyArray<T>,
  mapper: (item: T, index: number) => R
): ReadonlyArray<R> => {
  return array.map(mapper)
}

/**
 * オブジェクトの安全なマージ（不変性を保証）
 */
export const safeMerge = <T extends Record<string, unknown>>(
  ...objects: ReadonlyArray<Partial<T>>
): T => {
  return Object.assign({}, ...objects) as T
}