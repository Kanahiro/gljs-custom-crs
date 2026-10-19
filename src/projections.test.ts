import { describe, expect, it } from 'vitest';
import {
  countriesForProjection,
  createCRS,
  geographicDomain,
  graticule,
  presets,
} from './projections';
import type { FeatureCollection } from 'geojson';

describe('custom projection contract', () => {
  for (const preset of presets) {
    it(`${preset.label}: center survives a forward/inverse round trip inside the grid`, () => {
      const crs = createCRS(preset.definition, preset.grid, preset.center);
      const result = crs.projection.inverse(
        crs.projection.forward(preset.center),
      );
      expect(result).not.toBeNull();
      if (!result) throw new Error('Projection returned no inverse');
      expect(result[0]).toBeCloseTo(preset.center[0], 5);
      expect(result[1]).toBeCloseTo(preset.center[1], 5);
    });
  }
  it('rejects malformed definitions and invalid grids before map replacement', () => {
    const preset = presets[0];
    for (const definition of [
      '',
      '+proj=not-a-projection',
      '+proj=utm +zone=bad',
    ]) {
      expect(() => createCRS(definition, preset.grid, preset.center)).toThrow();
    }
    for (const width of [0, -1, NaN, Infinity]) {
      expect(() =>
        createCRS(
          preset.definition,
          { origin: [0, 0], extentAtZoom0: width },
          preset.center,
        ),
      ).toThrow();
    }
    expect(() =>
      createCRS(
        preset.definition,
        { origin: [0, 0], extentAtZoom0: 1 },
        preset.center,
      ),
    ).toThrow('範囲外');
  });
  it('matches the Web Mercator tile grid at its world corners', () => {
    const preset = presets[0];
    const crs = createCRS(preset.definition, preset.grid, preset.center);
    const [x, y] = crs.projection.forward([-180, 85.0511287798066]);
    expect(x).toBeCloseTo(preset.grid.origin[0], 5);
    expect(y).toBeCloseTo(preset.grid.origin[1], 5);
  });
  it('removes complete polygons crossing the transverse Mercator discontinuity', () => {
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'near' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [139, 35],
                [140, 35],
                [140, 36],
                [139, 35],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'far' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const definition = presets.find(
      (preset) => preset.id === '32654',
    )!.definition;
    expect(
      countriesForProjection(data, definition).features.map(
        (feature) => feature.properties?.name,
      ),
    ).toEqual(['near']);
    const domain = geographicDomain(definition);
    for (const feature of graticule(definition).features) {
      for (const [lon, lat] of feature.geometry.coordinates) {
        expect(lon).toBeGreaterThanOrEqual(domain[0]);
        expect(lon).toBeLessThanOrEqual(domain[2]);
        expect(lat).toBeGreaterThanOrEqual(domain[1]);
        expect(lat).toBeLessThanOrEqual(domain[3]);
      }
    }
  });
});
