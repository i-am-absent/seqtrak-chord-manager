# GitHub Pagesフロントエンド公開

## 公開先

- Repository: `i-am-absent/seqtrak-chord-manager`
- Branch: `master`
- URL: `https://i-am-absent.github.io/seqtrak-chord-manager/`

`master`へのpushで、テストと本番ビルドに成功した内容だけをGitHub Pagesへ公開する。Supabase migrationの適用はこのワークフローでは行わない。

## 初回設定

GitHubのリポジトリで **Settings > Secrets and variables > Actions > Variables** を開き、次のRepository Variablesを登録する。

- `VITE_SUPABASE_URL`: Supabase Dashboardに表示されるProject URL
- `VITE_SUPABASE_ANON_KEY`: ブラウザ用のanonymous key

service-role key、データベースパスワード、PATは登録しない。値はビルド後のブラウザ資産から参照できる公開設定であり、アクセス制御はSupabaseのRLSとRPC権限で行う。

次に **Settings > Pages > Build and deployment > Source** で **GitHub Actions** を選択する。

## 自動デプロイ

通常は検証済みの`master`をpushする。

```bash
git push origin master
```

**Actions > Deploy GitHub Pages** で実行状況を確認する。`build`の成功後に`deploy`が実行され、environment URLへ公開される。

## 手動再実行

**Actions > Deploy GitHub Pages > Run workflow** を開き、branchに`master`を指定して実行する。コード差分がない設定変更後はこの方法を使う。

## 公開確認

ブラウザで次を開く。

```text
https://i-am-absent.github.io/seqtrak-chord-manager/
```

画面とJavaScript/CSSが読み込まれることを確認する。SEQTRAK接続ではWeb MIDI対応ブラウザを使用し、SysExアクセスを許可する。

## 障害対応

- `Missing required GitHub Pages variables`: Repository Variablesの名前と空欄を確認し、値をログへ貼り付けず手動再実行する
- test failure: Actionsログで最初に失敗したテストをローカルで再現し、修正を別コミットにする
- build failure: Node.js 20.19以上で`npm ci && npm run build`を再現する
- Pages permission failure: Pages SourceがGitHub Actionsであることと、buildの`contents: read`、`pages: read`、deployの`pages: write`、`id-token: write`を確認する
- 404またはasset failure: 公開URLに`/seqtrak-chord-manager/`が含まれ、`dist/index.html`のasset URLも同じprefixであることを確認する

失敗した実行は新しいartifactを公開しないため、直前に成功したサイトを維持する。Supabase障害やschema変更は`docs/operations/supabase-sharing-backend.md`に従って切り分ける。
