/**
 * Hello Hatago Plugin Example - 関数型プログラミング実装
 *
 * Hatagoプラグインシステムの最もシンプルな実装例
 * 純粋関数、不変性、合成可能性を重視した設計
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * プラグイン設定（読み取り専用）
 */
interface HelloPluginOptions {
  readonly defaultName: string
  readonly includeTimestamp: boolean
  readonly enableProgress: boolean
}

/**
 * 入力データの型（検証後）
 */
interface ValidatedInput {
  readonly name: string
  readonly includeEmoji: boolean
  readonly progressToken?: string
}

/**
 * 挨拶データの型（純粋なデータ）
 */
interface Greeting {
  readonly message: string
  readonly timestamp?: string
  readonly emoji?: string
}

/**
 * MCPツールレスポンスの型
 */
interface ToolResponse {
  readonly content: ReadonlyArray<{
    readonly type: 'text'
    readonly text: string
  }>
  readonly isError?: boolean
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定（不変）
 */
const DEFAULT_OPTIONS: HelloPluginOptions = {
  defaultName: 'Hatago',
  includeTimestamp: false,
  enableProgress: true,
} as const

/**
 * 入力データの検証（純粋関数）
 * エラー時は例外を投げる（関数型エラーハンドリング）
 */
const validateInput = (input: unknown): ValidatedInput => {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Input must be an object')
  }

  const obj = input as Record<string, unknown>

  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    includeEmoji: Boolean(obj.includeEmoji),
    progressToken: typeof obj.progressToken === 'string' ? obj.progressToken : undefined,
  }
}

/**
 * 絵文字の選択（純粋関数）
 */
const selectEmoji = (includeEmoji: boolean): string => {
  if (!includeEmoji) return ''

  const emojis = ['👋', '🎉', '✨', '🚀', '💫'] as const
  const index = Math.floor(Math.random() * emojis.length)
  return ` ${emojis[index]}`
}

/**
 * 挨拶メッセージの生成（純粋関数）
 */
const createGreeting =
  (options: HelloPluginOptions) =>
  (input: ValidatedInput): Greeting => {
    // 名前の決定
    const name = input.name || options.defaultName

    // 基本メッセージの構築
    const baseMessage = `Hello ${name}!`

    // 絵文字の追加（条件付き）
    const emoji = selectEmoji(input.includeEmoji)

    // タイムスタンプの追加（オプション）
    const timestamp = options.includeTimestamp ? new Date().toISOString() : undefined

    return {
      message: baseMessage + emoji,
      timestamp,
      emoji: emoji.trim(),
    }
  }

/**
 * MCPレスポンス形式への変換（純粋関数）
 */
const formatResponse = (greeting: Greeting): ToolResponse => {
  // メッセージの構築
  let text = greeting.message

  if (greeting.timestamp) {
    text += `\n⏰ ${greeting.timestamp}`
  }

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: false,
  }
}

/**
 * プログレス通知の送信（副作用を持つ関数）
 */
const notifyProgress = async (
  server: any,
  progressToken: string,
  progress: number,
  total: number,
  message: string
): Promise<void> => {
  if (!progressToken) return

  try {
    await server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total,
        message,
      },
    })
  } catch (error) {
    // プログレス通知のエラーは無視（非クリティカル）
    console.warn('Progress notification failed:', error)
  }
}

// ===== 関数合成とプラグイン実装 =====

/**
 * ツールハンドラーの作成（高階関数）
 */
const createToolHandler =
  (options: HelloPluginOptions) =>
  async (request: any, server?: any): Promise<ToolResponse> => {
    try {
      // 1. 入力の検証
      const validatedInput = validateInput(request.params.arguments)

      // 2. プログレス通知（開始）
      if (options.enableProgress && validatedInput.progressToken) {
        await notifyProgress(
          server,
          validatedInput.progressToken,
          0,
          100,
          'Starting greeting generation...'
        )
      }

      // 3. 挨拶の生成（純粋な処理）
      const greeting = createGreeting(options)(validatedInput)

      // 4. プログレス通知（完了）
      if (options.enableProgress && validatedInput.progressToken) {
        await notifyProgress(
          server,
          validatedInput.progressToken,
          100,
          100,
          'Greeting generated successfully!'
        )
      }

      // 5. レスポンスの形成
      return formatResponse(greeting)
    } catch (error) {
      // エラーハンドリング
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }

/**
 * メインプラグイン関数（HatagoPlugin実装）
 */
export const createHelloPlugin = (userOptions: Partial<HelloPluginOptions> = {}): HatagoPlugin => {
  // 設定のマージ（不変）
  const options: HelloPluginOptions = { ...DEFAULT_OPTIONS, ...userOptions }

  // プラグイン関数を返す（クロージャー）
  return async ctx => {
    // MCPツールの登録（宣言的な定義）
    ctx.server.registerTool(
      'hello_hatago',
      {
        description:
          'Generate a friendly greeting message with optional emoji and progress notifications',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet (defaults to "Hatago")',
            },
            includeEmoji: {
              type: 'boolean',
              description: 'Include a random emoji in the greeting',
              default: false,
            },
          },
          additionalProperties: false,
        },
      },
      // ツールハンドラーの適用
      createToolHandler(options)
    )
  }
}

// ===== テストシナリオ定義 =====

/**
 * テストシナリオ（不変データ）
 */
const testScenarios: readonly TestScenario[] = [
  {
    name: 'Basic greeting',
    input: { name: 'World' },
    expectedOutput: 'Hello World!',
  },
  {
    name: 'Greeting with emoji',
    input: { name: 'Hatago', includeEmoji: true },
    expectedOutput: 'Hello Hatago! 👋', // Note: actual emoji varies
  },
  {
    name: 'Default name',
    input: {},
    expectedOutput: 'Hello Hatago!',
  },
  {
    name: 'Invalid input handling',
    input: null,
    shouldFail: true,
  },
] as const

// ===== 実行設定のエクスポート =====

/**
 * デフォルトの実行設定
 */
const config: ExampleConfig = {
  name: 'hello-hatago',
  description: 'Simple greeting plugin with functional programming patterns',
  plugin: createHelloPlugin({
    defaultName: 'Hatago',
    includeTimestamp: false,
    enableProgress: true,
  }),
  testScenarios,
  env: {
    LOG_LEVEL: 'info',
  },
} as const

export default config
