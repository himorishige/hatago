# Hatago NPMパッケージリリースチェックリスト

## 📦 初版リリース準備状況

### ✅ 完了済み項目

#### フェーズ1: 重複解消と整理

- [x] server/とcore/の機能重複を解消
- [x] ツール名をMCP仕様準拠（アンダースコア）に統一
- [x] CLIをpackages/配下に移動
- [x] server/をcore依存の参照実装に変更

#### フェーズ2: インターフェース統一

- [x] アダプタインターフェースの定義と実装
- [x] プラグインシステムの統一（nullチェック対応）
- [x] HatagoMode（stdio/http）の実装

#### フェーズ3: ビルド体制

- [x] TypeScriptビルド設定
- [x] 各パッケージのpackage.json整備
- [x] リポジトリ情報とライセンス追加

#### フェーズ4: リリース準備

- [x] Changesets CLI導入
- [x] リリーススクリプト追加
- [x] パッケージメタデータ設定

### 📝 リリース前の手動確認事項

1. **バージョン設定**
   - [ ] 初版は `0.1.0` で統一
   - [ ] Changesetを作成（`pnpm changeset`）

2. **ビルド確認**
   - [ ] `pnpm build` が成功
   - [ ] `pnpm typecheck` が成功

3. **依存関係**
   - [ ] workspace依存が正しく解決される
   - [ ] peerDependenciesの確認

4. **公開設定**
   - [ ] npm アカウントでログイン（`npm login`）
   - [ ] パッケージ名の重複確認
   - [ ] `publishConfig.access: "public"` 設定

5. **ドキュメント**
   - [ ] README.mdの最終確認
   - [ ] CLAUDE.mdの更新確認

## 🚀 リリースコマンド

```bash
# 1. Changesetを作成
pnpm changeset

# 2. バージョン更新
pnpm version

# 3. ビルドとリリース
pnpm release
```

## 📦 公開パッケージ一覧

- `@hatago/core` - コア機能
- `@hatago/adapter-node` - Node.jsアダプタ
- `@hatago/adapter-workers` - Cloudflare Workersアダプタ
- `@hatago/cli` - CLIツール
- `@hatago/config` - 設定管理
- `@hatago/plugin-*` - 各種プラグイン

## ⚠️ 注意事項

- `@hatago/reference-server` は private パッケージ（公開しない）
- 初版リリースは `@next` タグでcanaryリリース推奨
- 問題がなければ `@latest` タグで正式リリース
