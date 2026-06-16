# SVGMap 機能の検討

## 結論

リアルタイム測位と背景地図表示はMapLibre GLを中心に実装する。SVGMap.jsはメイン地図エンジンとして置き換えるより、訓練後の成果物共有や静的WebGISレイヤー出力として使う方が向いている。

## メリット

- GitHub Pagesのような静的ホスティングと相性がよい
- 訓練ログをクリック可能な点データとして共有できる
- SVGなので編集・再利用しやすい
- QGISやGeoJSONに加えて、軽量な報告資料として使える

## 今回の実装

- `SVGMap` 出力ボタンを追加
- 現在の位置ログを `gisphn-svgmap-layer.svg` として出力
- SVG内に `data-lat`, `data-lng` を保持

## 方針

- リアルタイム運用はMapLibre GL
- 訓練後の共有・報告用はSVGMap出力
- 必要に応じてSVGMap.js閲覧ページを別画面として追加
