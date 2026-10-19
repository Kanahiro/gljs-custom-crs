<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Map,
    NavigationControl,
    addProjection,
    removeProjection,
    importScriptInWorkers,
    setWorkerUrl,
    prewarm,
    clearPrewarmedResources,
  } from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import type { Coordinates } from 'maplibre-gl';
  import type { FeatureCollection } from 'geojson';
  import {
    PROJECTION_NAME,
    presets,
    createCRS,
    countriesForProjection,
    graticule,
  } from './projections';
  import 'maplibre-gl/dist/maplibre-gl.css';

  let projectedContainer: HTMLDivElement;
  let projected: Map | undefined;
  let countries: FeatureCollection;
  let ready = $state(false);
  let busy = $state(true);
  let error = $state('');
  let selected = $state(presets[0].id);
  let definition = $state(presets[0].definition);
  let originX = $state(presets[0].grid.origin[0]);
  let originY = $state(presets[0].grid.origin[1]);
  let extent = $state(presets[0].grid.extentAtZoom0);
  let longitude = $state(137);
  let latitude = $state(36);
  let zoom = $state(2.5);
  let applied = $state(presets[0].label);
  let dirty = $state(false);
  let gridVisible = $state(true);
  let tilesVisible = $state(true);
  let imageVisible = $state(false);
  let imageOpacity = $state(80);
  let imageAvailable = $state(true);
  // Bounds of the original Web Mercator tile (z=5, x=28, y=12), clockwise.
  const imageCoordinates: Coordinates = [
    [135, 40.97989806962013],
    [146.25, 40.97989806962013],
    [146.25, 31.952162238024968],
    [135, 31.952162238024968],
  ];
  let cursor = $state('地図上にカーソルを移動');
  let projectedPosition = $state('—');
  let currentZoom = $state('2.50');
  const preset = $derived(presets.find((entry) => entry.id === selected));

  function selectPreset() {
    const next = presets.find((entry) => entry.id === selected);
    if (!next) return;
    definition = next.definition;
    [originX, originY] = next.grid.origin;
    extent = next.grid.extentAtZoom0;
    [longitude, latitude] = next.center;
    zoom = next.zoom;
    dirty = true;
  }

  function applyProjection() {
    if (!ready) return;
    error = '';
    try {
      if (
        ![longitude, latitude, zoom].every(Number.isFinite) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90 ||
        zoom < -2 ||
        zoom > 18
      ) {
        throw new Error(
          '中心座標は経度 ±180°・緯度 ±90°、ズームは -2〜18 で指定してください。',
        );
      }
      const crs = createCRS(
        definition,
        { origin: [originX, originY], extentAtZoom0: extent },
        [longitude, latitude],
      );
      const land = countriesForProjection(countries, definition);
      const lines = graticule(definition);
      imageAvailable = imageCoordinates.every((coordinate) => {
        try {
          const [x, y] = crs.projection.forward(coordinate);
          const inverse = crs.projection.inverse([x, y]);
          return (
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            x >= originX &&
            x <= originX + extent &&
            y <= originY &&
            y >= originY - extent &&
            inverse !== null &&
            Math.abs(inverse[0] - coordinate[0]) < 1e-5 &&
            Math.abs(inverse[1] - coordinate[1]) < 1e-5
          );
        } catch {
          return false;
        }
      });
      // Sources keep their initial projection; a fresh map is required on each CRS change.
      projected?.remove();
      projected = undefined;
      removeProjection(PROJECTION_NAME);
      addProjection(crs);
      busy = true;
      applied = preset?.definition === definition ? preset.label : 'Custom CRS';
      projected = new Map({
        container: projectedContainer,
        style: {
          version: 8,
          projection: { type: PROJECTION_NAME },
          sources: {
            countries: {
              type: 'geojson',
              data: land,
              attribution:
                '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
            },
            graticule: { type: 'geojson', data: lines },
            'mercator-tiles': {
              type: 'raster',
              tiles: [
                'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              minzoom: 0,
              maxzoom: 18,
              attribution:
                '<a href="https://maps.gsi.go.jp/development/ichiran.html#std">国土地理院 標準地図</a>',
            },
            ...(imageAvailable
              ? {
                  'sample-image': {
                    type: 'image' as const,
                    url: `${import.meta.env.BASE_URL}japan-relief.png`,
                    coordinates: imageCoordinates,
                  },
                }
              : {}),
          },
          layers: [
            {
              id: 'ocean',
              type: 'background',
              paint: { 'background-color': '#e8eef2' },
            },
            {
              id: 'land',
              type: 'fill',
              source: 'countries',
              paint: { 'fill-color': '#f8f8f6' },
            },
            // Deliberately use the current CRS grid to expose the lack of tile reprojection.
            {
              id: 'mercator-tiles',
              type: 'raster',
              source: 'mercator-tiles',
              layout: { visibility: tilesVisible ? 'visible' : 'none' },
              paint: { 'raster-fade-duration': 0 },
            },
            // Images are positioned by four corners, not reprojected pixel by pixel.
            ...(imageAvailable
              ? [
                  {
                    id: 'sample-image',
                    type: 'raster' as const,
                    source: 'sample-image',
                    layout: {
                      visibility: imageVisible
                        ? ('visible' as const)
                        : ('none' as const),
                    },
                    paint: {
                      'raster-opacity': imageOpacity / 100,
                      'raster-fade-duration': 0,
                    },
                  },
                ]
              : []),
            {
              id: 'borders',
              type: 'line',
              source: 'countries',
              paint: { 'line-color': '#7c8690', 'line-width': 0.8 },
            },
            {
              id: 'graticule',
              type: 'line',
              source: 'graticule',
              layout: { visibility: gridVisible ? 'visible' : 'none' },
              paint: {
                'line-color': '#788c9c',
                'line-width': 0.7,
                'line-opacity': 0.5,
                'line-dasharray': [3, 3],
              },
            },
          ],
        },
        center: [longitude, latitude],
        zoom,
        minZoom: -2,
        maxZoom: 18,
        renderWorldCopies: false,
        attributionControl: {
          compact: true,
          customAttribution: imageAvailable
            ? '<a href="https://maps.gsi.go.jp/development/ichiran.html#relief">国土地理院 色別標高図</a> · 海域部は海上保安庁海洋情報部の資料を使用して作成'
            : [],
        },
      });
      projected.addControl(
        new NavigationControl({ visualizePitch: true }),
        'top-right',
      );
      projected.on('load', () => {
        busy = false;
      });
      projected.on('error', (event) => {
        error = `描画エラー: ${event.error.message}`;
        busy = false;
      });
      projected.on('zoom', () => {
        currentZoom = projected!.getZoom().toFixed(2);
      });
      projected.on('mousemove', (event) => {
        cursor = `${event.lngLat.lng.toFixed(5)}°, ${event.lngLat.lat.toFixed(5)}°`;
        try {
          const point = crs.projection.forward([
            event.lngLat.lng,
            event.lngLat.lat,
          ]);
          projectedPosition = point.every(Number.isFinite)
            ? point
                .map((v) =>
                  v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
                )
                .join(' / ')
            : '投影範囲外';
        } catch {
          projectedPosition = '投影範囲外';
        }
      });
      currentZoom = zoom.toFixed(2);
      cursor = '地図上にカーソルを移動';
      projectedPosition = '—';
      dirty = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      busy = false;
    }
  }

  function toggleGrid() {
    if (projected?.getLayer('graticule'))
      projected.setLayoutProperty(
        'graticule',
        'visibility',
        gridVisible ? 'visible' : 'none',
      );
  }

  function updateImage() {
    if (!projected?.getLayer('sample-image')) return;
    projected.setLayoutProperty(
      'sample-image',
      'visibility',
      imageVisible ? 'visible' : 'none',
    );
    projected.setPaintProperty(
      'sample-image',
      'raster-opacity',
      imageOpacity / 100,
    );
  }

  function toggleTiles() {
    if (!projected?.getLayer('mercator-tiles')) return;
    projected.setLayoutProperty(
      'mercator-tiles',
      'visibility',
      tilesVisible ? 'visible' : 'none',
    );
  }

  function locateImage() {
    if (!projected || !imageAvailable) return;
    projected.fitBounds([imageCoordinates[3], imageCoordinates[1]], {
      padding: 50,
      maxZoom: 8,
      duration: 0,
    });
  }

  onMount(() => {
    let cancelled = false;
    setWorkerUrl(workerUrl);
    // Keep the registered projection handler alive while replacing the only map.
    prewarm();
    async function initialize() {
      try {
        const [response] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}countries.geojson`),
          importScriptInWorkers(
            new URL(
              `${import.meta.env.BASE_URL}projection-worker.js`,
              location.href,
            ).href,
          ),
        ]);
        if (cancelled) return;
        if (!response.ok)
          throw new Error(
            `国境データの取得に失敗しました (${response.status})。`,
          );
        countries = await response.json();
        if (cancelled) return;
        ready = true;
        applyProjection();
      } catch (cause) {
        if (!cancelled) {
          error = cause instanceof Error ? cause.message : String(cause);
          busy = false;
        }
      }
    }
    void initialize();
    const resize = new ResizeObserver(() => {
      projected?.resize();
    });
    resize.observe(projectedContainer);
    return () => {
      cancelled = true;
      resize.disconnect();
      projected?.remove();
      clearPrewarmedResources();
      removeProjection(PROJECTION_NAME);
    };
  });
</script>

<div class="app-shell">
  <header class="app-header">
    <h1>カスタム投影</h1>
    <span>MapLibre GL JS 6.15.0</span>
    <a
      href="https://maplibre.org/maplibre-gl-js/docs/guides/custom-crs/"
      target="_blank"
      rel="noreferrer">API リファレンス</a
    >
  </header>
  <aside aria-label="投影設定">
    <form
      onsubmit={(event) => {
        event.preventDefault();
        applyProjection();
      }}
    >
      <label for="preset">CRS プリセット</label>
      <select id="preset" bind:value={selected} onchange={selectPreset}>
        {#each presets as entry}<option value={entry.id}>{entry.label}</option
          >{/each}
        <option value="custom">自由入力</option>
      </select>
      <p class="field-hint">
        {preset?.description ??
          'proj4js が対応する PROJ string を入力してください。'}
      </p>
      <label for="definition">PROJ string</label>
      <textarea
        id="definition"
        spellcheck="false"
        bind:value={definition}
        oninput={() => {
          dirty = true;
        }}
      ></textarea>
      <div class="apply-row">
        <button class="apply" type="submit" disabled={!ready || busy}
          >適用</button
        >
        <span class="apply-status" aria-live="polite"
          >{busy
            ? '読み込み中…'
            : dirty
              ? '未適用の変更あり'
              : '適用済み'}</span
        >
      </div>
      {#if error}<div class="error" role="alert">{error}</div>{/if}
      <details>
        <summary>グリッド・初期表示</summary>
        <p class="field-hint">
          実験用の正方形グリッドです。公式タイルマトリクスではありません。原点は左上、幅は
          CRS の座標単位。
        </p>
        <div class="input-pair">
          <label
            >原点 X<input
              type="number"
              step="any"
              bind:value={originX}
              oninput={() => {
                dirty = true;
              }}
              required
            /></label
          ><label
            >原点 Y<input
              type="number"
              step="any"
              bind:value={originY}
              oninput={() => {
                dirty = true;
              }}
              required
            /></label
          >
        </div>
        <label
          >ズーム 0 の幅<input
            type="number"
            step="any"
            min="0.000001"
            bind:value={extent}
            oninput={() => {
              dirty = true;
            }}
            required
          /></label
        >
        <div class="input-pair">
          <label
            >中心経度<input
              type="number"
              step="any"
              min="-180"
              max="180"
              bind:value={longitude}
              oninput={() => {
                dirty = true;
              }}
              required
            /></label
          ><label
            >中心緯度<input
              type="number"
              step="any"
              min="-90"
              max="90"
              bind:value={latitude}
              oninput={() => {
                dirty = true;
              }}
              required
            /></label
          >
        </div>
        <label
          >初期ズーム<input
            type="number"
            step="0.1"
            min="-2"
            max="18"
            bind:value={zoom}
            oninput={() => {
              dirty = true;
            }}
            required
          /></label
        >
      </details>
    </form>
    <div class="view-settings">
      <h2>表示</h2>
      <label class="checkbox"
        ><input
          type="checkbox"
          bind:checked={gridVisible}
          onchange={toggleGrid}
        />経緯線 <span>15° 間隔</span></label
      >
    </div>
    <div class="view-settings">
      <h2>XYZ タイル</h2>
      <label class="checkbox"
        ><input
          type="checkbox"
          bind:checked={tilesVisible}
          onchange={toggleTiles}
        />地理院 標準地図 <span>EPSG:3857</span></label
      >
      <p class="field-hint">
        再投影せず現在のグリッドに配置します。CRS・グリッドが配信元と異なる場合、位置がずれます。
      </p>
    </div>
    <div class="view-settings">
      <h2>画像レイヤー</h2>
      <label class="checkbox"
        ><input
          type="checkbox"
          bind:checked={imageVisible}
          onchange={updateImage}
          disabled={!imageAvailable}
        />色別標高図</label
      >
      <label class="opacity-label" for="image-opacity"
        >不透明度 <output for="image-opacity">{imageOpacity}%</output></label
      >
      <input
        id="image-opacity"
        type="range"
        min="0"
        max="100"
        step="1"
        bind:value={imageOpacity}
        oninput={updateImage}
        disabled={!imageAvailable}
      />
      <button
        class="locate-image"
        type="button"
        onclick={locateImage}
        disabled={!ready || busy || !imageAvailable}>画像の位置へ移動</button
      >
      <p class="field-hint">
        国土地理院の画像を四隅で配置。画像内部の厳密な再投影は行いません。
      </p>
      {#if !imageAvailable}<p class="field-hint">
          画像が現在の投影・グリッドの範囲外です。
        </p>{/if}
    </div>
    <div class="sidebar-note">
      <details>
        <summary>表示の制約</summary>
        <p>
          国境は Natural Earth 1:110m
          の概略データです。投影範囲の境界をまたぐポリゴンは省略しています。
        </p>
      </details>
    </div>
  </aside>
  <main>
    <section class="map-panel" aria-label="カスタム投影地図">
      <div class="map-title">
        <h2>投影結果</h2>
        <span>{applied}</span>
      </div>
      <div class="map-canvas" bind:this={projectedContainer}></div>
      {#if busy}<div class="loading" role="status">読み込み中…</div>{/if}
    </section>
    <div class="coordinate-strip" aria-label="投影地図の座標">
      <span><b>経度・緯度</b> {cursor}</span>
      <span><b>X / Y</b> {projectedPosition}</span>
      <span class="zoom-status"><b>ズーム</b> {currentZoom}</span>
    </div>
  </main>
</div>
