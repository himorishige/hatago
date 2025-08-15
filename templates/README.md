# Hatago Templates

このディレクトリにはHatago CLIで使用するテンプレートファイルが格納されています。

## ディレクトリ構造

```
templates/
├── plugins/          # プラグインテンプレート
│   ├── basic/        # 基本的なプラグインテンプレート
│   ├── tool/         # ツール提供プラグイン
│   ├── resource/     # リソース提供プラグイン
│   └── middleware/   # ミドルウェアプラグイン
├── projects/         # プロジェクトテンプレート
│   ├── basic/        # 基本サーバー
│   ├── with-proxy/   # プロキシ対応サーバー
│   └── plugin-only/  # プラグインベースサーバー
└── examples/         # サンプルコード
    ├── tools/        # ツール実装例
    ├── resources/    # リソース実装例
    └── integrations/ # 外部サービス連携例
```

## テンプレート形式

テンプレートファイルは[Handlebars](https://handlebarsjs.com/)形式で記述されています。

### 利用可能な変数

- `{{name}}` - プラグイン/プロジェクト名
- `{{description}}` - 説明文
- `{{author}}` - 作成者名
- `{{version}}` - バージョン
- `{{timestamp}}` - 作成日時
- `{{namespace}}` - 名前空間
- `{{toolName}}` - ツール名（ツールテンプレート用）

### 条件分岐

```handlebars
{{#if hasAuth}}
  // 認証機能付きコード
{{/if}}

{{#unless isBasic}}
  // 高度な機能コード
{{/unless}}
```

### ループ

```handlebars
{{#each tools}}
  server.registerTool('{{name}}', handler)
{{/each}}
```

## カスタムテンプレート

ユーザーは独自のテンプレートを追加できます：

1. 適切なディレクトリに`.hbs`ファイルを追加
2. `template.config.json`でメタデータを定義
3. `hatago scaffold`コマンドで利用可能
