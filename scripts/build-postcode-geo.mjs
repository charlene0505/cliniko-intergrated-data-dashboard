// Builds the static geography behind the overview's patient map, from ABS ASGS Edition 3 (2021)
// digital boundary files — © Australian Bureau of Statistics, CC BY 4.0. Nothing here runs at build or
// request time: the two JSON outputs are committed. To regenerate, download and unzip
// POA_2021_AUST_GDA2020_SHP.zip and SA3_2021_AUST_SHP_GDA2020.zip from
// https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
// then run:
//   node scripts/build-postcode-geo.mjs <dir containing POA_2021_AUST_GDA2020.shp> <dir containing SA3_2021_AUST_GDA2020.shp>
//
// Outputs:
// - src/lib/geo/nsw-postcodes.json   every 2xxx postal area's centre point and the SA3 region it sits in
// - src/lib/geo/sydney-basemap.json  simplified postal-area outlines around Sydney, pre-projected to SVG
//                                    units, plus the projection constants to place points on top of them
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [poaDir, sa3Dir] = process.argv.slice(2);
if (!poaDir || !sa3Dir) {
  console.error('Usage: node scripts/build-postcode-geo.mjs <POA shapefile dir> <SA3 shapefile dir>');
  process.exit(1);
}

// The map's frame: Penrith to the coast, Hornsby to Sutherland — wide enough for every region the
// clinics draw from. Equirectangular with longitude scaled by cos(mid-latitude), which is accurate to
// well under 1% across a city-sized area.
const VIEW = { minLng: 150.6, maxLng: 151.36, minLat: -34.2, maxLat: -33.58, width: 1000 };
const COS_MID = Math.cos(((VIEW.minLat + VIEW.maxLat) / 2) * (Math.PI / 180));
const K = VIEW.width / ((VIEW.maxLng - VIEW.minLng) * COS_MID);
const HEIGHT = Math.round((VIEW.maxLat - VIEW.minLat) * K);
// ~150 m — below what's visible at panel size, and it keeps the outline file small.
const SIMPLIFY_DEGREES = 0.0015;

// ── Shapefile + dBase readers (polygon shapefiles only) ─────────────────────────

function readPolygons(shpPath) {
  const buf = readFileSync(shpPath);
  const shapes = [];
  let offset = 100;
  while (offset < buf.length) {
    const contentBytes = buf.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const type = buf.readInt32LE(start);
    if (type === 5) {
      const numParts = buf.readInt32LE(start + 36);
      const numPoints = buf.readInt32LE(start + 40);
      const partsAt = start + 44;
      const pointsAt = partsAt + numParts * 4;
      const rings = [];
      for (let p = 0; p < numParts; p++) {
        const from = buf.readInt32LE(partsAt + p * 4);
        const to = p + 1 < numParts ? buf.readInt32LE(partsAt + (p + 1) * 4) : numPoints;
        const ring = [];
        for (let i = from; i < to; i++) ring.push([buf.readDoubleLE(pointsAt + i * 16), buf.readDoubleLE(pointsAt + i * 16 + 8)]);
        rings.push(ring);
      }
      shapes.push(rings);
    } else {
      shapes.push(null); // null shape: a postal area with no land geometry
    }
    offset = start + contentBytes;
  }
  return shapes;
}

function readDbf(dbfPath) {
  const buf = readFileSync(dbfPath);
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] });
  }
  const rows = [];
  for (let r = 0; r < count; r++) {
    let o = headerLen + r * recordLen + 1; // skip the deletion flag
    const row = {};
    for (const f of fields) {
      row[f.name] = buf.toString('utf8', o, o + f.len).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

// ── Geometry ──────────────────────────────────────────────────────────────────

// Area-weighted centroid across all rings. Shapefile outer rings wind clockwise and holes
// counter-clockwise, so signed areas subtract holes automatically.
function centroid(rings) {
  let area = 0, cx = 0, cy = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
  }
  if (Math.abs(area) < 1e-12) return ring0Mean(rings[0]);
  return [cx / (3 * area), cy / (3 * area)];
}

function ring0Mean(ring) {
  const n = ring.length;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}

// Even-odd ray cast across all rings, so holes are respected.
function contains(rings, [x, y]) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function bounds(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// Douglas–Peucker, iterative so large coastal rings can't blow the stack.
function simplify(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst !== -1) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

const project = ([lng, lat]) => [(lng - VIEW.minLng) * COS_MID * K, (VIEW.maxLat - lat) * K];
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

// ── Build ────────────────────────────────────────────────────────────────────

const poaShapes = readPolygons(join(poaDir, 'POA_2021_AUST_GDA2020.shp'));
const poaRows = readDbf(join(poaDir, 'POA_2021_AUST_GDA2020.dbf'));
const sa3Shapes = readPolygons(join(sa3Dir, 'SA3_2021_AUST_GDA2020.shp'));
const sa3Rows = readDbf(join(sa3Dir, 'SA3_2021_AUST_GDA2020.dbf'));

// NSW (1) and ACT (8) regions only — every 2xxx postcode falls in one of the two.
const regions = sa3Rows
  .map((row, i) => ({ row, rings: sa3Shapes[i] }))
  .filter(({ row, rings }) => rings && (row.STE_CODE21 === '1' || row.STE_CODE21 === '8'))
  .map(({ row, rings }) => ({ name: row.SA3_NAME21, greaterSydney: row.GCC_NAME21 === 'Greater Sydney', rings, box: bounds(rings) }));

const postcodes = {};
const outlinePaths = [];
let unassigned = 0;

poaRows.forEach((row, i) => {
  const code = row.POA_CODE21;
  const rings = poaShapes[i];
  if (!rings || !/^2\d{3}$/.test(code)) return;

  const [lng, lat] = centroid(rings);
  const region = regions.find((r) => lng >= r.box.minX && lng <= r.box.maxX && lat >= r.box.minY && lat <= r.box.maxY && contains(r.rings, [lng, lat]));
  if (!region) unassigned++;
  postcodes[code] = {
    lng: round(lng, 4),
    lat: round(lat, 4),
    region: region?.name ?? null,
    greaterSydney: region?.greaterSydney ?? false,
  };

  const box = bounds(rings);
  if (box.maxX < VIEW.minLng || box.minX > VIEW.maxLng || box.maxY < VIEW.minLat || box.minY > VIEW.maxLat) return;
  for (const ring of rings) {
    const simple = simplify(ring, SIMPLIFY_DEGREES);
    if (simple.length < 4) continue;
    outlinePaths.push(
      'M' + simple.map((p) => project(p).map((n) => round(n, 1)).join(' ')).join('L') + 'Z',
    );
  }
});

const outDir = join(process.cwd(), 'src/lib/geo');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'nsw-postcodes.json'), JSON.stringify(postcodes));
writeFileSync(
  join(outDir, 'sydney-basemap.json'),
  JSON.stringify({
    attribution: 'Postal Areas and SA3 boundaries © Australian Bureau of Statistics (ASGS Edition 3, 2021), CC BY 4.0',
    view: { ...VIEW, height: HEIGHT, k: round(K, 4), cosMid: round(COS_MID, 6) },
    path: outlinePaths.join(''),
  }),
);

console.log(
  `postcodes: ${Object.keys(postcodes).length} (${unassigned} without an SA3 region) · outline rings: ${outlinePaths.length} · view ${VIEW.width}×${HEIGHT}`,
);
