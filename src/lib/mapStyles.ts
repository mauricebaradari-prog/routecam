import type { StyleSpecification } from 'maplibre-gl';

// Map style: Esri satellite imagery only (CARTO "Dark Matter" removed 29.10. – one provider less).
// Terms (see 07_TODO.md): Esri free only for non-revenue apps (< 1M tiles/month, attribution).
// MAP_STYLES stays a list so another style can be added back later.

export type MapStyleId = 'satellite';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const esriTiles = (service: string) => [`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`];

const IMAGERY_ATTR = 'Esri, Maxar, Earthstar Geographics, GIS User Community';

function raster(layers: { id: string; service: string; attribution: string; maxzoom?: number }[]): StyleSpecification {
  const sources: StyleSpecification['sources'] = {};
  for (const l of layers) {
    // maxzoom on the source = deepest level the service has; MapLibre overzooms beyond it
    sources[l.id] = { type: 'raster', tiles: esriTiles(l.service), tileSize: 256, maxzoom: l.maxzoom ?? 19, attribution: l.attribution };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },
      ...layers.map(l => ({ id: `${l.id}-layer`, type: 'raster' as const, source: l.id })),
    ],
  };
}

export const MAP_STYLES: { id: MapStyleId; label: string; hint: string; style: () => string | StyleSpecification }[] = [
  {
    id: 'satellite', label: 'Satellit', hint: 'Satellitenbild ohne Beschriftung',
    style: () => raster([{ id: 'satellite', service: 'World_Imagery', attribution: IMAGERY_ATTR }]),
  },
];

export function buildMapStyle(id: MapStyleId): string | StyleSpecification {
  return (MAP_STYLES.find(s => s.id === id) ?? MAP_STYLES[0]).style();
}
