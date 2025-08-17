/**
 * 共通型定義 - プラグイン例で使用する不変データ構造
 */

import type { HatagoPlugin } from '@hatago/core'

/**
 * 実行例の設定（不変）
 */
export interface ExampleConfig {
  readonly name: string
  readonly description: string
  readonly plugin: HatagoPlugin
  readonly testScenarios?: ReadonlyArray<TestScenario>
  readonly env?: Readonly<Record<string, string>>
}

/**
 * テストシナリオの定義
 */
export interface TestScenario {
  readonly name: string
  readonly input: unknown
  readonly expectedOutput?: unknown
  readonly shouldFail?: boolean
}

/**
 * 実行結果（不変）
 */
export interface ExampleResult {
  readonly success: boolean
  readonly output: unknown
  readonly duration: number
  readonly error?: string
}

/**
 * 実行モード
 */
export type ExampleMode = 'smoke' | 'full' | 'interactive'

/**
 * 実行オプション（不変）
 */
export interface RunOptions {
  readonly mode: ExampleMode
  readonly json: boolean
  readonly verbose: boolean
  readonly timeout: number
}

/**
 * ログエントリ（不変）
 */
export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly message: string
  readonly data?: unknown
  readonly timestamp?: string
}

/**
 * 関数型ユーティリティ型
 */
export type Pure<T> = (input: T) => T
export type Effect<T, R> = (input: T) => Promise<R>
export type Predicate<T> = (input: T) => boolean

/**
 * 不変性ヘルパー
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}