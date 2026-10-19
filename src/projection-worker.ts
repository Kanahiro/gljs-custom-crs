import proj4 from 'proj4';

// MapLibre loads this classic-script bundle into its own workers, not a new Worker.
const projectionWorker = self as unknown as {
  setProjectionHandler: (
    handler: (definition: string) => proj4.Converter,
  ) => void;
};
projectionWorker.setProjectionHandler((definition) =>
  proj4('EPSG:4326', definition),
);
