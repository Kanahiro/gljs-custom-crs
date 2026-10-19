import proj4 from 'proj4';
import type { CRS, TileMatrixSet } from 'maplibre-gl';
import type { FeatureCollection, LineString, Position, Polygon } from 'geojson';

export const PROJECTION_NAME = 'custom:lab';

export type Preset = {
  id: string;
  label: string;
  description: string;
  definition: string;
  grid: TileMatrixSet;
  center: [number, number];
  zoom: number;
};

const worldGrid: TileMatrixSet = {
  origin: [-20037508.342789244, 20037508.342789244],
  extentAtZoom0: 40075016.68557849,
};

export const presets: Preset[] = [
  {
    id: '3857',
    label: 'EPSG:3857 · Web Mercator',
    description: '一般的な Web 地図で使われるメルカトル投影。',
    definition:
      '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
    grid: worldGrid,
    center: [137, 36],
    zoom: 2.5,
  },
  {
    id: '4326',
    label: 'EPSG:4326 · WGS 84',
    description: '経度・緯度をそのまま平面に配置します。座標単位は度です。',
    definition: '+proj=longlat +datum=WGS84 +no_defs',
    grid: { origin: [-180, 180], extentAtZoom0: 360 },
    center: [0, 0],
    zoom: -0.5,
  },
  {
    id: '8857',
    label: 'EPSG:8857 · Equal Earth',
    description: '面積の比率を保つ世界地図。高緯度の形の変化を比較。',
    definition: '+proj=eqearth +lon_0=0 +datum=WGS84 +units=m +no_defs',
    grid: worldGrid,
    center: [0, 0],
    zoom: -0.5,
  },
  {
    id: '54009',
    label: 'ESRI:54009 · Mollweide',
    description: '楕円形の正積投影。経緯線の曲がり方を確認できます。',
    definition: '+proj=moll +lon_0=0 +datum=WGS84 +units=m +no_defs',
    grid: worldGrid,
    center: [0, 0],
    zoom: -0.5,
  },
  {
    id: '32654',
    label: 'EPSG:32654 · WGS 84 / UTM 54N',
    description: '東経 141° を中央子午線とする UTM。日本付近で検証。',
    definition: '+proj=utm +zone=54 +datum=WGS84 +units=m +no_defs',
    grid: { origin: [-5500000, 10000000], extentAtZoom0: 12000000 },
    center: [141, 36],
    zoom: 3.5,
  },
  {
    id: '6677',
    label: 'EPSG:6677 · JGD2011 / 平面直角 IX',
    description:
      '東京付近を対象とする平面直角座標系。表示順は Easting / Northing。',
    definition:
      '+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
    grid: { origin: [-1000000, 1000000], extentAtZoom0: 2000000 },
    center: [139.76, 35.68],
    zoom: 5,
  },
  {
    id: '3413',
    label: 'EPSG:3413 · 北極ステレオ',
    description: '北極を中心とする極心平射図法。北半球を表示します。',
    definition:
      '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +datum=WGS84 +units=m +no_defs',
    grid: { origin: [-12500000, 12500000], extentAtZoom0: 25000000 },
    center: [0, 89.99],
    zoom: 0.5,
  },
];

export function createCRS(
  definition: string,
  grid: TileMatrixSet,
  center: [number, number],
): CRS {
  if (!definition.trim()) throw new Error('PROJ string を入力してください。');
  if (
    !grid.origin.every(Number.isFinite) ||
    !Number.isFinite(grid.extentAtZoom0) ||
    grid.extentAtZoom0 <= 0
  ) {
    throw new Error(
      'グリッド原点は有限の数値、幅は 0 より大きい数値にしてください。',
    );
  }
  let converter: proj4.Converter;
  try {
    converter = proj4('EPSG:4326', definition.trim());
    const point = converter.forward(center);
    const roundtrip = converter.inverse(point);
    if (
      ![...point, ...roundtrip].every(Number.isFinite) ||
      Math.abs(roundtrip[0] - center[0]) > 1e-5 ||
      Math.abs(roundtrip[1] - center[1]) > 1e-5
    ) {
      throw new Error('roundtrip');
    }
    const [x, y] = point;
    if (
      x < grid.origin[0] ||
      x > grid.origin[0] + grid.extentAtZoom0 ||
      y > grid.origin[1] ||
      y < grid.origin[1] - grid.extentAtZoom0
    ) {
      throw new Error('outside-grid');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'outside-grid')
      throw new Error(
        '表示中心がグリッド範囲外です。原点・幅、または中心座標を調整してください。',
      );
    throw new Error(
      'PROJ string を解釈できないか、表示中心を往復変換できません。投影名・パラメータ・中心座標を確認してください。',
    );
  }
  return {
    name: PROJECTION_NAME,
    definition: definition.trim(),
    projection: converter,
    tileMatrixSet: grid,
  };
}

// Transverse Mercator has a discontinuity on the far side of the world.
// Exclude polygons crossing it before workers tile the data (MapLibre #8800).
export function geographicDomain(
  definition: string,
): [number, number, number, number] {
  const zone = Number(definition.match(/\+zone=([\d.]+)/)?.[1]);
  const lon = Number(definition.match(/\+lon_0=([-\d.]+)/)?.[1] ?? 0);
  if (/\+proj=(utm|tmerc)\b/.test(definition)) {
    const meridian = /\+proj=utm\b/.test(definition) ? zone * 6 - 183 : lon;
    return [
      Math.max(-180, meridian - 60),
      -80,
      Math.min(180, meridian + 60),
      84,
    ];
  }
  if (/\+proj=stere\b/.test(definition) && /\+lat_0=90\b/.test(definition))
    return [-180, 0, 180, 89.99];
  if (/\+proj=stere\b/.test(definition) && /\+lat_0=-90\b/.test(definition))
    return [-180, -89.99, 180, 0];
  return [-180, -85, 180, 85];
}

export function countriesForProjection(
  countries: FeatureCollection,
  definition: string,
): FeatureCollection<Polygon> {
  const [west, south, east, north] = geographicDomain(definition);
  const inside = ([lon, lat]: Position) =>
    lon >= west && lon <= east && lat >= south && lat <= north;
  return {
    type: 'FeatureCollection',
    features: countries.features.flatMap((feature) => {
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiPolygon'
            ? feature.geometry.coordinates
            : [];
      return polygons
        .filter((polygon) => polygon.every((ring) => ring.every(inside)))
        .map((coordinates) => ({
          type: 'Feature' as const,
          properties: feature.properties,
          geometry: { type: 'Polygon' as const, coordinates },
        }));
    }),
  };
}

export function graticule(definition: string): FeatureCollection<LineString> {
  const [west, south, east, north] = geographicDomain(definition);
  const lines: Position[][] = [];
  for (let lon = Math.ceil(west / 15) * 15; lon <= east; lon += 15) {
    const line: Position[] = [];
    for (let lat = south; lat <= north; lat += 1) line.push([lon, lat]);
    lines.push(line);
  }
  for (let lat = Math.ceil(south / 15) * 15; lat <= north; lat += 15) {
    const line: Position[] = [];
    for (let lon = west; lon <= east; lon += 1) line.push([lon, lat]);
    lines.push(line);
  }
  return {
    type: 'FeatureCollection',
    features: lines.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  };
}
