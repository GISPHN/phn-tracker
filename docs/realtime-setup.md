# リアルタイム同期設定

スマホの位置をPC本部画面へリアルタイム表示するには、Supabaseの無料プロジェクトを1つ作成し、`app-config.js` にURLとanon keyを設定します。

## 1. テーブル作成

Supabase SQL Editorで `docs/supabase-schema.sql` を実行します。

## 2. app-config.js

```js
window.GISPHN_CONFIG = {
  mode: "supabase",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
};
```

## 3. 確認

- スマホ側は現地モードで活動開始
- PC側は本部モードを押す
- スマホ側とPC側の `訓練セッションID` を完全に同じ値にする
- 右上の状態表示が `同期接続` になれば、スマホの位置ログがPCへ反映されます

## 複数訓練を同時に行う場合

データは `session_id` で分離しています。同じ `訓練セッションID` を使った端末だけが同じ本部画面に表示されます。

- 混在する例: 2つの訓練がどちらも `nara-training-001` を使う
- 分離される例: 奈良市訓練は `20260616-nara-narashi-drill-01`、橿原市訓練は `20260616-nara-kashihara-drill-01` を使う

命名は `YYYYMMDD-都道府県-自治体名-訓練名` のように、日付と自治体名を含める運用を推奨します。将来的には、入力ミスを減らすために `?session=20260616-nara-narashi-drill-01` のようなURLやQRコードで配布できるようにすると安全です。

## 注意

このスキーマとRLSポリシーは訓練プロトタイプ用です。実災害や家庭訪問で使う場合は、認証、権限、保存期間、個人情報保護の設計を追加してください。
