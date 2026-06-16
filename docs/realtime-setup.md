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
- 右上の状態表示が `同期接続` になれば、スマホの位置ログがPCへ反映されます

## 注意

このスキーマとRLSポリシーは訓練プロトタイプ用です。実災害や家庭訪問で使う場合は、認証、権限、保存期間、個人情報保護の設計を追加してください。
