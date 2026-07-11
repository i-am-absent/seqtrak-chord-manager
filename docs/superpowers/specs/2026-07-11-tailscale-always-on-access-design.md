# Tailscale常時アクセス設計

## 目的

Raspberry Pi 5上のSEQTRAK Chord Managerを常時起動し、同じtailnetに参加しているWindowsおよびiPhoneのブラウザから安全にアクセスできるようにする。

## スコープ

- Raspberry Pi再起動後にアプリを自動起動する。
- Tailscale Serveを使い、tailnet内限定のHTTPS URLで公開する。
- アプリ本体はlocalhostだけで待ち受け、LANやインターネットへ直接公開しない。
- 運用方法と確認手順をリポジトリに記録する。

公開パック機能、インターネット一般への公開、複数アプリをパスで振り分けるリバースプロキシ構成は対象外とする。

## アーキテクチャ

1. `npm run build` が静的ファイルを `dist/` に生成する。
2. systemdのシステムサービスが、固定ポートのlocalhost HTTPサーバーとしてビルド済みアプリを配信する。
3. Tailscale ServeがHTTPSを終端し、localhost HTTPサーバーへ転送する。
4. tailnet内の端末は、Raspberry PiのMagicDNS完全修飾名を使ったHTTPS URLへアクセスする。

ローカルHTTPサーバーは `127.0.0.1` のみにbindする。Tailscale Serveはバックグラウンド構成として保存し、TailscaleおよびRaspberry Piの再起動後も共有を再開させる。

## コンポーネント

### ビルド済みWebアプリ

既存のViteビルドを使用する。常時運用では開発サーバーを公開せず、`dist/` の成果物を配信する。アプリ更新時は再ビルドしてサービスを再起動する。

### localhost HTTPサーバー

systemdで管理し、次の性質を持たせる。

- リポジトリのビルド済み成果物を配信する。
- `127.0.0.1` の固定ポートだけで待ち受ける。
- Raspberry Pi起動時に開始する。
- 異常終了時はsystemdにより再起動する。
- 専用の低権限実行ユーザーとして、現在のRaspberry Piユーザーを使用し、rootでは実行しない。

具体的なポート番号とHTTPサーバーコマンドは、既存ポートとの競合を実装時に確認して決定する。

### Tailscale Serve

localhost HTTPサーバーをtailnet内限定のHTTPS URLとして公開する。Tailscale Funnelは使用しない。tailnetのアクセス制御規則がそのまま適用される。

初回にtailnetのHTTPS証明書機能を有効化するため、Tailscaleが提示する管理画面での承認が必要になる場合がある。この操作だけはユーザーが実施する。

## アクセスとデータフロー

1. WindowsまたはiPhoneがTailscaleへ接続する。
2. ブラウザが `https://<raspberry-piのMagicDNS完全修飾名>/` を開く。
3. Tailscale Serveが端末のtailnetアクセス権を確認し、TLSを終端する。
4. リクエストをlocalhost HTTPサーバーへ転送する。
5. HTTPサーバーがビルド済みアプリを返す。

Web MIDI/SysExはHTTPSのセキュアコンテキストを必要とする。MIDI機能が参照するのはブラウザを実行している端末のMIDIデバイスであり、Raspberry Piへ接続されたデバイスではない。Windowsの対応ブラウザでSEQTRAKを使う場合は、SEQTRAKをWindowsへ接続する。iPhoneでは閲覧・編集・Web Audioの対応範囲を利用できるが、Web MIDI操作は対象外とする。

## エラー処理と運用

- HTTPサーバーが異常終了した場合、systemdが自動再起動する。
- アプリが未ビルドの場合はサービスを起動せず、systemdログに原因を残す。
- Tailscaleが未接続の場合、アプリはlocalhostで稼働を続け、Tailscale復旧後に外部アクセスを再開する。
- ポート競合がある場合は導入時に別の固定ポートへ変更する。
- 障害調査にはsystemdのサービス状態・journalと `tailscale serve status` を使用する。

## セキュリティ

- アプリのHTTPポートはlocalhost限定とする。
- HTTPS入口はTailscale Serveだけとする。
- Funnelを有効化せず、一般インターネットには公開しない。
- tailnetの既存アクセス制御を尊重する。
- Vite開発サーバーを常時公開しない。

## 検証

- 既存の自動テストが成功すること。
- 本番ビルドが成功し、`dist/` が生成されること。
- localhost HTTPサーバーからアプリを取得できること。
- Tailscale ServeのHTTPS URLをWindowsとiPhoneから開けること。
- Windowsの対応ブラウザでWeb MIDI権限要求がセキュアコンテキスト上で行えること。
- HTTPサーバーを意図的に停止した後、systemdが再起動すること。
- Raspberry Pi再起動後、手動コマンドなしでHTTPS URLへ再接続できること。
- Tailscaleに参加していない端末からアクセスできないこと。

## 成功条件

Raspberry PiとTailscaleが稼働していれば、ユーザーがサーバー起動コマンドを実行せずに、tailnet内のWindowsおよびiPhoneから固定HTTPS URLでツールを開ける。
