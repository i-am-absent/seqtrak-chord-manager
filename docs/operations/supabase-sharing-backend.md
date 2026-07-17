# Supabaseコードパック共有基盤

## 前提

- Docker Engine と Docker Compose
- Node.js 20 以上
- Supabase アカウントと、新規作成した Free project
- Docker daemon を操作できるユーザー。Docker group への所属は daemon 経由でホストの root と同等の権限を与えるため、信頼できるユーザーだけを追加する
- service-role key、データベースパスワード、personal access token（PAT）は表示、フロントエンドへの設定、リポジトリへの commit をしない

このリポジトリでは、VPN の一時的な source port と `54324` が衝突したため、ローカル SMTP UI を `http://127.0.0.1:8025` で公開している。

## ローカル起動・停止

このリポジトリのルートで実行する。

```bash
npm run supabase:start
npm run db:reset
npm run test:db
npm run supabase:stop
```

Docker socket の利用に `docker` group が必要な環境では、権限を広げる影響を理解したうえで、対象コマンドだけを group context で実行する。

```bash
sg docker -c 'npm run supabase:start'
sg docker -c 'npm run db:reset'
sg docker -c 'npm run test:db'
sg docker -c 'npm run supabase:stop'
```

`db:reset` はローカル database を空にして、commit 済み migration を先頭から再適用する。ローカル検証では migrations を schema の source of truth として扱う。

## クラウド接続

> **保留中:** Hosted project の link、migration push、anonymous API の E2E 検証は、ユーザーが新しい Supabase project を作成し、対話的に login できるようになってから実施する。現時点では以下のコマンドを実行しない。

クラウド操作は必ずこのリポジトリ、またはこのリポジトリ用 worktree のルートから行う。新規 project の Settings で確認した project ref は operator shell の変数にだけ設定し、実値を shell history、ドキュメント、`.env*`、レポートへ書かない。`supabase/.temp/` などの link metadata と、すべての credential は commit しない。

```bash
read -r -p 'Supabase project ref: ' SUPABASE_PROJECT_REF
export SUPABASE_PROJECT_REF
npx supabase login
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase migration list
npx supabase db push --dry-run
```

**ここで停止する。** operator が `migration list` と `db push --dry-run` の出力を読み、意図した 2 件の sharing migration だけが対象で、schema drift がないことを確認する。確認結果に対する明示的な承認を得るまで、実際の push へ進まない。

### 承認後の push

上記の人手確認と明示承認が完了した場合に限り、独立した操作として一度だけ実行する。

```bash
npx supabase db push
```

### push 後の E2E 検証

push が成功してから、anonymous API の E2E を別の手順として実行する。環境変数から credential を渡す一回限りの検証スクリプトで、create、get、list、update、report、wrong-token rejection、delete、削除後の非表示を確認し、作成した test row を削除または soft-delete する。E2E の credential を command arguments、ファイル、レポートへ記録しない。

plain `npm run db:reset`（内部の `npx supabase db reset`）は、project が link 済みでも local stack を対象とするため、local 再現性検証に使用できる。禁止するのは `npx supabase db reset --linked` や production を指す `--db-url` を指定した reset など、remote database に対する破壊的 reset である。

## フロントエンド設定

`.env.example` を `.env.local` にコピーし、フロントエンドには次の 2 項目だけを設定する。

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

service-role key、データベースパスワード、PAT は `VITE_*` 変数にも、それ以外のフロントエンド設定にも含めない。`.env.local` は commit しない。

## 更新規則

1. schema 変更を local migration として作成する。
2. local database を reset し、全 migration が空の database へ再適用できることを確認する。
3. database test、unit test、server test、production build を通す。
4. migration を application code と一緒に review、commit する。
5. Hosted 側では `migration list` と `db push --dry-run` を確認してから、一度だけ push する。

Supabase Dashboard で production schema を直接編集しない。migration files を唯一の source of truth とし、drift を見つけたら push せずに原因を解消する。

## 障害対応

ローカルでは、credential を含む可能性のある出力を issue やレポートへ貼り付けず、次の状態を確認する。

```bash
npx supabase status
docker ps
```

Hosted 側では、このリポジトリ用 worktree から migration の対応状況を確認する。

```bash
npx supabase migration list
```

- ローカル stack が起動しない場合は、Docker daemon と port の使用状況を確認する。SMTP UI は Supabase の既定 port ではなく `http://127.0.0.1:8025` を使う
- local migration の再現性に問題がある場合は、未保存のデータを前提にせず、local `db:reset` で先頭から再現する
- Hosted 側に差分がある場合は、Dashboard で修正せず、local migration と dry run を見直す
- production に対して `npx supabase db reset --linked` や production の `--db-url` を指定した破壊的 reset を実行しない。plain local `npm run db:reset` はこの禁止対象ではない
- status や start の出力に含まれる local keys も credential として扱い、共有前に除去する
