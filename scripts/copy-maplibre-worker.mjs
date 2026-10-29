// MapLibre GL v6 loads its tile worker from a file next to its own bundle.
// Next.js bundles MapLibre into a chunk, so that file is missing (404) and no
// vector/GeoJSON source can load. Copy the worker files into public/ so they
// are served at /routecam/maplibre/… — runs automatically before dev/build.
import { copyFileSync, mkdirSync } from 'node:fs';

const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
mkdirSync('public/maplibre', { recursive: true });
for (const f of files) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
console.log('maplibre worker copied to public/maplibre/');
