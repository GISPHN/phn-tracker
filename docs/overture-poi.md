# Overture Maps POI 検証メモ

## 結論

Overture Maps Placesは、災害保健師チームの位置共有プロトタイプに表示するメリットがあります。病院、駅、公共施設、ランドマークなどを重ねることで、現地チームと本部が「どの目印の近くにいるか」を共有しやすくなります。

## 実装

- `data/overture-nara-poi.sample.geojson` を追加
- `Overture POI` トグルで表示
- Overture Places互換の `names`, `categories`, `addresses` を読む
- 医療系カテゴリは赤系、それ以外は中立色で表示

## 実データ方針

ブラウザでOverture全量GeoParquetを直接読むのは重すぎるため、DuckDBなどで奈良県または訓練対象市町村だけGeoJSONへ切り出して静的配信する。

```sql
LOAD spatial;
LOAD httpfs;
SET s3_region='us-west-2';

COPY (
  SELECT id, CAST(names AS JSON) AS names, CAST(categories AS JSON) AS categories,
         basic_category, confidence, CAST(addresses AS JSON) AS addresses, geometry
  FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=places/*/*')
  WHERE bbox.xmin BETWEEN 135.50 AND 136.25
    AND bbox.ymin BETWEEN 34.15 AND 34.85
    AND confidence >= 0.7
) TO 'data/overture-nara-poi.geojson'
WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
```
