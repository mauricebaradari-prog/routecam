// Adds missing elevation sparklines (src/data/sparklines.json) for routes in useEditorState.ts.
// Usage (in the Earth folder): node scripts/generate-missing-sparklines.cjs
const fs = require('fs');
const https = require('https');

// Extract routes from useEditorState.ts
const content = fs.readFileSync('src/hooks/useEditorState.ts', 'utf8');
const routesMatch = content.match(/export const ROUTES: RouteConfig\[\] = (\[[\s\S]*?\]);/);
if (!routesMatch) {
  console.error("Could not find ROUTES array");
  process.exit(1);
}

// Quick and dirty eval to parse the JS array structure
// We just need the ID and cities
let ROUTES;
try {
  // Strip out types to make it valid JS
  let cleanCode = routesMatch[1].replace(/as any/g, '');
  ROUTES = eval(cleanCode);
} catch (e) {
  console.error("Eval failed:", e);
  process.exit(1);
}

async function fetchOsrm(cities) {
  const coords = cities.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.routes && json.routes.length > 0) {
            resolve(json.routes[0].geometry.coordinates); // [lng, lat][]
          } else {
            // fallback to just straight lines between cities
            resolve(cities.map(c => [c.lng, c.lat]));
          }
        } catch (e) {
          resolve(cities.map(c => [c.lng, c.lat]));
        }
      });
    }).on('error', (e) => {
      resolve(cities.map(c => [c.lng, c.lat]));
    });
  });
}

function getDistance(p1, p2) {
  const R = 6371e3;
  const f1 = p1[1] * Math.PI / 180;
  const f2 = p2[1] * Math.PI / 180;
  const df = (p2[1] - p1[1]) * Math.PI / 180;
  const dl = (p2[0] - p1[0]) * Math.PI / 180;
  const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchElevations(points) {
  const lats = points.map(p => p[1]).join(',');
  const lngs = points.map(p => p[0]).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.elevation || points.map(() => 0));
        } catch(e) {
          resolve(points.map(() => 0));
        }
      });
    }).on('error', () => {
      resolve(points.map(() => 0));
    });
  });
}

async function run() {
  // keep existing curves, only add routes that have none yet
  const file = 'src/data/sparklines.json';
  const sparklines = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

  for (const route of ROUTES) {
    if (sparklines[route.id] && sparklines[route.id].length) continue;
    console.log(`Processing ${route.name}...`);
    // 1. Fetch path
    const path = await fetchOsrm(route.cities);
    
    // 2. Compute distances and sample 20 points
    let totalDist = 0;
    const dists = [0];
    for (let i = 1; i < path.length; i++) {
      totalDist += getDistance(path[i-1], path[i]);
      dists.push(totalDist);
    }
    
    const numSamples = 20;
    const sampled = [];
    for (let i = 0; i < numSamples; i++) {
      const targetDist = (i / (numSamples - 1)) * totalDist;
      // find segment
      for (let j = 1; j < dists.length; j++) {
        if (dists[j] >= targetDist || j === dists.length - 1) {
          const p1 = path[j-1];
          const p2 = path[j];
          const d1 = dists[j-1];
          const d2 = dists[j];
          const frac = (d2 === d1) ? 0 : (targetDist - d1) / (d2 - d1);
          sampled.push([
            p1[0] + (p2[0] - p1[0]) * frac,
            p1[1] + (p2[1] - p1[1]) * frac
          ]);
          break;
        }
      }
    }
    
    // 3. Fetch elevations for these 20 points
    const elevations = await fetchElevations(sampled);
    if (!Array.isArray(elevations) || elevations.length === 0 || elevations.some(e => typeof e !== 'number') || elevations.every(e => e === 0)) {
      console.log(`  ! no elevation data for ${route.id}, skipped`);
      continue;
    }
    sparklines[route.id] = elevations;
    console.log(`  ${route.id}: ${elevations.map(e => Math.round(e)).join(', ')}`);
    
    // throttle slightly
    await new Promise(r => setTimeout(r, 500));
  }
  
  fs.mkdirSync('src/data', { recursive: true });
  fs.writeFileSync('src/data/sparklines.json', JSON.stringify(sparklines, null, 2));
  console.log('Saved to src/data/sparklines.json');
}

run();
