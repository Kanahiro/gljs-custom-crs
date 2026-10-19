# Projection Lab

公開 URL: https://kanahiro.github.io/gljs-custom-crs/

MapLibre GL JS **6.15.0** のカスタム平面 CRS API を確認するブラウザアプリです。
任意の PROJ string で投影した GeoJSON を表示します。

## 起動

Node.js 24 と pnpm 11 を使用します。

```sh
pnpm install
pnpm dev
```

表示されたローカル URL を開きます。サーバー・API キーは不要です。

```sh
pnpm check    # Svelte と TypeScript の型チェック
pnpm test     # 投影の往復変換、入力検証、描画対象領域の検証
pnpm format:check
pnpm build   # dist/ に静的アプリを生成
pnpm preview # 本番ビルドのローカル確認
```

本番ビルドは GitHub Pages の `/gljs-custom-crs/` 配下で動作します。`pnpm preview` の確認 URL は `http://127.0.0.1:4173/gljs-custom-crs/` です。開発サーバーは引き続き `/` で動作します。

## GitHub Pages

`main` への push 後、GitHub Actions でフォーマット・型・テストを確認してビルドし、成功した場合に GitHub Pages へ自動デプロイします。Pull Request では検証のみ実行します。Actions の手動実行にも対応しています。

GitHub リポジトリの Settings → Pages → Source は **GitHub Actions** に設定します。追加のシークレットは不要です。

## 使い方

1. サイドメニューから CRS プリセットを選択します。
2. 必要に応じて PROJ string を編集します。自由入力も可能です。
3. 「適用」で地図を再生成します。無効な定義は適用前にエラーを表示します。
4. 「グリッド・初期表示」でグリッド原点、ズーム 0 の幅、表示中心とズームを変更できます。
5. 地図上のカーソル位置を経緯度・投影座標で確認できます。経緯線の表示も切り替えられます。
6. 「画像レイヤー」でサンプル画像の表示・不透明度を変更できます。「画像の位置へ移動」で画像全体を表示します。
7. 「XYZ タイル」で EPSG:3857 の地理院標準地図を表示・非表示にできます。初期状態では XYZ タイルを表示し、単一画像は非表示です。
8. 同じ欄の「OSM ベクター」で EPSG:3857 の MVT も試せます。地理院ラスタ・OSM ベクターは独立して切り替えられます。ベクターだけを見る場合は地理院標準地図をオフにしてください。

プリセット：EPSG:3857、EPSG:4326、EPSG:8857、ESRI:54009、EPSG:32654、EPSG:6677、EPSG:3413。
プリセット選択後も「適用」までは表示を変更しません。

## 検証上の制約

- [MapLibre のカスタム CRS](https://maplibre.org/maplibre-gl-js/docs/guides/custom-crs/) は **既存タイルを再投影しません**。投影の検証には同梱の GeoJSON を使用します。
- XYZ タイルの URL は `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`、256px、ズーム 0〜18 です。地理院標準地図は EPSG:3857 ですが、検証のため選択中の CRS のタイルグリッドへそのまま配置します。Web Mercator の CRS・グリッドに一致する初期プリセット以外では誤った場所に表示されます。四隅を指定して配置する画像ソースとは別の挙動です。タイルの取得にはネットワーク接続が必要です。出典：[国土地理院 標準地図](https://maps.gsi.go.jp/development/ichiran.html#std)。
- ベクターは [tile.openstreetmap.jp の osm-bright-ja スタイル](https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json) のベクターソース・描画レイヤー・フォント・スプライトを使用します。初回オン時にスタイルを取得し、CRS 切り替え後も表示設定を維持します。MVT の頂点は再投影しません。別 CRS・グリッドで国境 GeoJSON と位置がずれる挙動を確認できます。スタイル・タイル・フォント・スプライトの取得にはネットワーク接続が必要です。出典は元の TileJSON から地図に表示します。
- 地図は Natural Earth の国境ポリゴン（1:110m）と 15° 間隔の経緯線です。測量精度の比較用ではありません。文字ラベルや道路はありません。
- サンプル画像は国土地理院の色別標高図（元タイル z=5 / x=28 / y=12）です。`image` ソースと `raster` レイヤーを使い、四隅の経緯度で配置します。画像内部をピクセル単位で再投影するものではなく、カスタム投影では内部の地物と国境がずれることがあります。画像の四隅が投影・グリッド範囲外の場合は画像レイヤーを省略します。
- プリセットの正方形グリッドは **このアプリ用の実験設定** です。CRS コードだけではタイルマトリクスは決まりません。実際の投影済みタイルを追加する場合は配信元の原点と範囲に合わせてください。
- 任意の PROJ string は proj4js が対応する定義に限ります。外部の測地変換グリッドは同梱していません。WGS 84 との精密な測地系変換を保証しません。平面直角座標系の投影座標表示は Easting / Northing 順です。
- 経緯線のサンプリングは 1° です。通常は緯度 ±85°、極心平射では対応する半球、UTM・横メルカトルでは中央子午線 ±60° にデータを制限します。境界をまたぐポリゴンは丸ごと省略するため、一部の国・南極は表示されません。これは反対側の世界を横切る不正なポリゴンを避けるためです（[MapLibre #8800](https://github.com/maplibre/maplibre-gl-js/issues/8800)）。任意の投影の特異点・適用範囲をすべて処理するものではありません。
- CRS 切り替え後にソースを再利用することは MapLibre 6.15.0 の制約に抵触するため、地図を再作成します。ページと MapLibre ワーカーに同じ proj4js の変換を登録します。ワーカーは地図の再作成中も保持し、投影ハンドラーの登録を維持します。
- EPSG:4326 のグリッドは度単位です。MapLibre の距離・高度に関する処理は CRS 単位をメートルとして扱うため、この地図で距離や高度は検証しません。

## 構成

Vite + Svelte + strict TypeScript の静的アプリです。バックエンドが不要なため SvelteKit / SSR は使用していません。

- `src/projections.ts`：プリセット、入力検証、投影対象データの準備。
- `src/App.svelte`：入力 UI と地図のライフサイクル。
- `src/projection-worker.ts`：MapLibre ワーカーに読み込む投影ハンドラー。dev / build 時に esbuild で生成します。
- `public/countries.geojson`：[Natural Earth の国境データ](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson)。プロパティを国名のみに縮小して同梱。Natural Earth は [public domain](https://www.naturalearthdata.com/about/terms-of-use/) です。
- `public/japan-relief.png`：[国土地理院 色別標高図](https://maps.gsi.go.jp/development/ichiran.html#relief) の [元画像](https://cyberjapandata.gsi.go.jp/xyz/relief/5/28/12.png)。海域部は海上保安庁海洋情報部の資料を使用して作成。地図の帰属表示にも出典を記載しています。

依存関係には 7 日間の公開待機期間を設定しています。検証対象として明示された `maplibre-gl@6.15.0` と、そのバージョンが要求する `@maplibre/geojson-vt@6.3.0` のみ例外です。
