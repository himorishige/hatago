/**
 * Vitest グローバルセットアップファイル
 * 全テストの実行前に実行される共通処理
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

// グローバル設定
beforeAll(async () => {
  // テスト用の環境変数設定
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error' // テスト中はログを抑制
  process.env.LOG_FORMAT = 'json'
  process.env.NOREN_MASKING = 'false' // テスト中はマスキング無効

  // stdio mode でのstdout汚染防止
  if (process.env.HATAGO_TRANSPORT === 'stdio') {
    // console.log を無効化
    global.console.log = () => {}
  }
})

afterAll(async () => {
  // グローバルクリーンアップ処理
})

beforeEach(() => {
  // 各テスト前のセットアップ
  // タイマーのリセット
  vi.useFakeTimers()
})

afterEach(() => {
  // 各テスト後のクリーンアップ
  vi.restoreAllMocks()
  vi.useRealTimers()

  // 環境変数のクリーンアップ
  process.env.TEST_CONFIG_PATH = undefined
  process.env.TEST_AUTH_TOKEN = undefined
  process.env.TEST_SERVER_URL = undefined
})
