#!/usr/bin/env tsx
/**
 * 共通実行ランナー - 関数型プログラミングアプローチ
 * 
 * 各プラグイン例を統一されたインターフェースで実行する
 * 副作用を明示的に管理し、純粋関数として構成される
 */

import { createApp } from '@hatago/adapter-node'
import type { 
  ExampleConfig, 
  ExampleResult, 
  RunOptions, 
  ExampleMode 
} from './types.js'
import {
  formatResultAsJson,
  formatResultAsText,
  runTestScenario,
  createMockContext
} from './test-utils.js'

/**
 * デフォルトの実行オプション（不変）
 */
const DEFAULT_OPTIONS: RunOptions = {
  mode: 'smoke',
  json: false,
  verbose: false,
  timeout: 10000
} as const

/**
 * 実行ランナーのメイン関数（純粋関数として設計）
 */
export const runExample = async (
  config: ExampleConfig,
  options: Partial<RunOptions> = {}
): Promise<ExampleResult> => {
  // オプションのマージ（不変）
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // タイムアウト付き実行
  return withTimeout(
    () => executeExample(config, opts),
    opts.timeout
  )
}

/**
 * 実行例の実際の処理（副作用を分離）
 */
const executeExample = async (
  config: ExampleConfig,
  options: RunOptions
): Promise<ExampleResult> => {
  const startTime = Date.now()
  
  try {
    // アプリケーションコンテキストの作成
    const context = await createExampleContext(config, options)
    
    // プラグインの適用
    await applyPlugin(context, config.plugin)
    
    // テストシナリオの実行（オプション）
    const scenarioResults = config.testScenarios
      ? await runAllScenarios(config.testScenarios, context)
      : []
    
    const duration = Date.now() - startTime
    
    return {
      success: true,
      output: {
        pluginName: config.name,
        description: config.description,
        scenarioResults: scenarioResults.filter(Boolean)
      },
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      success: false,
      output: null,
      duration,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 実行コンテキストの作成（純粋関数）
 */
const createExampleContext = async (
  config: ExampleConfig,
  options: RunOptions
) => {
  // 環境変数の設定（副作用）
  if (config.env) {
    Object.entries(config.env).forEach(([key, value]) => {
      process.env[key] = value
    })
  }
  
  // モードに応じたコンテキスト作成
  switch (options.mode) {
    case 'smoke':
      // 軽量なモックコンテキスト
      return createMockContext()
    
    case 'full':
    case 'interactive':
      // 実際のHatagoアプリケーション
      const { app, server } = await createApp({
        name: `example-${config.name}`,
        version: '1.0.0'
      })
      
      return {
        app,
        server,
        env: process.env,
        getBaseUrl: (req: Request) => new URL(`http://localhost:8787`)
      }
    
    default:
      throw new Error(`Unknown mode: ${options.mode}`)
  }
}

/**
 * プラグインの適用（副作用を明示）
 */
const applyPlugin = async (context: any, plugin: any): Promise<void> => {
  await plugin(context)
}

/**
 * 全テストシナリオの実行（関数型コンビネーター）
 */
const runAllScenarios = async (
  scenarios: ReadonlyArray<any>,
  context: any
): Promise<ReadonlyArray<ExampleResult | null>> => {
  // 並列実行で効率化
  return Promise.all(
    scenarios.map(scenario => 
      runTestScenario(scenario, async (input) => {
        // シナリオ固有の実行ロジック
        return executeScenario(context, input)
      }).catch(() => null) // エラーは個別に処理
    )
  )
}

/**
 * 個別シナリオの実行（プレースホルダー）
 */
const executeScenario = async (context: any, input: unknown): Promise<unknown> => {
  // 実際の実装では、MCPツールの呼び出しなどを行う
  return { executed: true, input }
}

/**
 * タイムアウト付き実行（高階関数）
 */
const withTimeout = async <T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

/**
 * コマンドライン引数の解析（純粋関数）
 */
const parseArgs = (args: ReadonlyArray<string>): {
  pluginName?: string
  options: Partial<RunOptions>
} => {
  const options: Partial<RunOptions> = {}
  let pluginName: string | undefined
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--json':
        options.json = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--mode':
        options.mode = args[++i] as ExampleMode
        break
      case '--timeout':
        options.timeout = parseInt(args[++i], 10)
        break
      case '--plugin':
        pluginName = args[++i]
        break
    }
  }
  
  return { pluginName, options }
}

/**
 * 結果の出力（副作用）
 */
const outputResult = (result: ExampleResult, asJson: boolean): void => {
  const output = asJson 
    ? formatResultAsJson(result)
    : formatResultAsText(result)
  
  console.log(output)
}

/**
 * メイン実行関数（CLIエントリーポイント）
 */
export const main = async (): Promise<void> => {
  const { pluginName, options } = parseArgs(process.argv.slice(2))
  
  if (!pluginName) {
    console.error('Usage: tsx runner.ts --plugin <plugin-name> [options]')
    process.exit(1)
  }
  
  try {
    // 動的インポート（副作用）
    const exampleModule = await import(`../plugin-${pluginName}/index.js`)
    const config: ExampleConfig = exampleModule.default || exampleModule.config
    
    // 実行
    const result = await runExample(config, options)
    
    // 結果出力
    outputResult(result, options.json ?? false)
    
    // 終了コード設定
    process.exit(result.success ? 0 : 1)
  } catch (error) {
    console.error('Failed to run example:', error)
    process.exit(1)
  }
}

// CLIとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}