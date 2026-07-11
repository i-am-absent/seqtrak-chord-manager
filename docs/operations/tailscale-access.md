# Tailscale経由での常時アクセス

## URLを確認する

```bash
sudo tailscale serve status
```

表示された `https://rp5.<tailnet-domain>.ts.net/` を、Tailscale接続済み端末で開く。

## アプリを更新する

```bash
cd /home/rpi/seqtrak-chord-manager
npm ci
npm test
npm run test:server
npm run build
sudo systemctl restart seqtrak-chord-manager.service
```

## 状態とログを確認する

```bash
systemctl status seqtrak-chord-manager.service
journalctl -u seqtrak-chord-manager.service -n 100 --no-pager
sudo tailscale serve status
curl -I http://127.0.0.1:4173/
```

PiからMagicDNS名を解決できない場合は、Tailscale DNSを有効にして再確認する。

```bash
sudo tailscale set --accept-dns=true
sudo tailscale serve status
```

## 公開を停止する

```bash
sudo tailscale serve reset
sudo systemctl disable --now seqtrak-chord-manager.service
```

`tailscale funnel` は使用しない。Web MIDIで操作できるのはブラウザ端末へ接続されたMIDI機器だけで、iPhoneのブラウザはWeb MIDI操作の対象外。
