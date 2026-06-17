# GIS-PHN Tracker

奈良県を対象にした、災害時保健師チーム向けの位置共有プロトタイプです。訓練・シミュレーション利用を想定し、Googleスプレッドシート + Apps Scriptで簡易同期します。

## 主な機能

- 表示名は `自治体名-姓`
- チーム名は自由入力
- 本部モードで訓練セッションIDとアクセスコードを自動発行
- スマホの位置を数十秒ごとにPC本部画面へ反映
- CSV / GeoJSON / SVGMap向けSVGを出力
- 初期MVPでは住民個人情報を扱わない

## 技術構成

- GitHub Pages: 静的Webアプリ公開
- MapLibre GL: Web地図表示
- Googleスプレッドシート + Apps Script: 訓練用の簡易同期バックエンド
- PWA / localStorage: 端末内保存とオフライン時の一時保持

## 設定

Googleスプレッドシート同期の設定は [docs/gas-sheet-setup.md](docs/gas-sheet-setup.md) を参照してください。
