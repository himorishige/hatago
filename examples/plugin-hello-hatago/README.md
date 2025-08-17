# Hello Hatago Plugin Example

Hatagoプラグインシステムの最もシンプルな実装例。関数型プログラミングのパターンを示す。

## 概要

このプラグインは：
- シンプルな挨拶メッセージを返すMCPツールを提供
- プログレス通知の基本的な使い方を示す
- 純粋関数による実装パターンを例示

## 実行方法

```bash
# スモークテスト（軽量）
pnpm ex --plugin hello-hatago --mode smoke

# フルテスト（実際のサーバー起動）
pnpm ex --plugin hello-hatago --mode full

# JSON出力
pnpm ex --plugin hello-hatago --json
```

## 期待される出力

### スモークテスト
```
✅ SUCCESS (45ms)
Output: {
  "pluginName": "hello-hatago",
  "description": "Simple greeting plugin with functional programming patterns",
  "scenarioResults": [
    {
      "success": true,
      "output": {
        "content": [
          {
            "type": "text",
            "text": "Hello World! 👋"
          }
        ]
      },
      "duration": 12
    }
  ]
}
```

### インタラクティブモード
実際のMCPサーバーとして起動し、以下のようなツール呼び出しが可能：

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "hello_hatago",
      "arguments": {
        "name": "World",
        "includeEmoji": true
      }
    }
  }'
```

## プラグインの特徴

### 関数型実装パターン
- **純粋関数**: 副作用のない関数として実装
- **不変性**: すべてのデータが不変
- **合成可能性**: 小さな関数の組み合わせで構築
- **型安全**: TypeScriptの型システムを活用

### プログレス通知
非同期処理の進捗を通知する機能を含む：
```typescript
// プログレス通知の例
await notifyProgress(progressToken, 50, 100, 'Generating greeting...')
```

## 学習ポイント

1. **HatagoPlugin型**: プラグインの基本インターフェース
2. **MCPツール登録**: `registerTool`の使い方
3. **入力検証**: Zodスキーマによる型安全な入力処理
4. **エラーハンドリング**: 関数型エラー処理パターン
5. **テスト戦略**: 純粋関数のテスト方法