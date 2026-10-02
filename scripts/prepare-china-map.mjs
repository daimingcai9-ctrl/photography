// Reproducible offline data preparation. No user photos or coordinates leave the device.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const revision = "5822c4c0a0bdfd73327f9454976c8661bfd6ad9f";
const base = `https://raw.githubusercontent.com/Supeset/China-GeoData/${revision}/`;
async function source(name) {
  let response;
  for (let attempt=0;attempt<3;attempt++) {
    try { response=await fetch(base+name,{signal:AbortSignal.timeout(30000)}); break; }
    catch(error) { if(attempt===2) throw error; }
  }
  if (!response.ok) throw Error(`Map source: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw Error("Map source too large");
  return { text: bytes.toString("utf8"), sha256: createHash("sha256").update(bytes).digest("hex") };
}
// Douglas–Peucker, iterative to bound the stack even for long island coastlines.
function ring(points, tolerance) {
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [x, y] = points[a], [xx, yy] = points[b], dx = xx - x, dy = yy - y;
    let max = tolerance * tolerance, index = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i], t = dx || dy ? Math.max(0, Math.min(1, ((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy))) : 0;
      const distance = (px-x-t*dx)**2 + (py-y-t*dy)**2;
      if (distance > max) { max = distance; index = i; }
    }
    if (index >= 0) { keep.add(index); stack.push([a,index],[index,b]); }
  }
  const simplified = [...keep].sort((a,b)=>a-b).map(i=>points[i].map(n=>Number(n.toFixed(4))));
  return simplified.length >= 4 ? simplified : [points[0],points[Math.floor((points.length-1)/3)],points[Math.floor((points.length-1)*2/3)],points[points.length-1]].map(p=>p.map(n=>Number(n.toFixed(4))));
}
const [provinceSource, citySource, license] = await Promise.all([
  source("geojson/china_province_full.geojson"), source("geojson/china_province_city_full.geojson"), source("LICENSE")
]);
const provinces = JSON.parse(provinceSource.text).features, cities = JSON.parse(citySource.text).features;
if (provinces.length !== 35 || cities.length !== 477 || !license.text.includes("MIT License")) throw Error("Unexpected map source");
const provinceNames = new Map(provinces.map(f=>[f.properties.adcode,f.properties.name]));
function prepare(feature) {
  if (!["Polygon","MultiPolygon"].includes(feature.geometry.type)) return null;
  const p = feature.properties, parent = p.parent?.adcode;
  const municipal = [110000,120000,310000,500000,710000,810000,820000].includes(parent);
  const name = municipal ? provinceNames.get(parent) : p.name;
  if (!name || !p.adcode || !p.center) return null;
  const coordinates = feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates.map(r=>ring(r,.035))
    : feature.geometry.coordinates.map(p=>p.map(r=>ring(r,.035)));
  const points = coordinates.flat(feature.geometry.type === "Polygon" ? 1 : 2);
  return { type:"Feature", properties:{name:name.replace(/市$/, ""),adcode:p.adcode,center:p.center},
    bbox:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],
    geometry:{type:feature.geometry.type,coordinates} };
}
const target = "android/app/src/main/assets/ui/world-land.geojson";
const world = JSON.parse(await readFile(target, "utf8"));
const municipalCodes = [110000,120000,310000,500000,710000,810000,820000];
world.china = { provinces:provinces.map(prepare).filter(Boolean),
  cities:[...provinces.filter(f=>municipalCodes.includes(f.properties.adcode)),...cities.filter(f=>!municipalCodes.includes(f.properties.parent?.adcode)&&!municipalCodes.includes(f.properties.adcode))].map(prepare).filter(Boolean),
  attribution:"China-GeoData · MIT © 2025 圈集; Natural Earth · Public domain",
  source:base, revision, hashes:{provinces:provinceSource.sha256,cities:citySource.sha256}, license:license.text,
  accuracy:"Simplified administrative boundaries (~4 km); approximate city labels, not navigation or a legal boundary reference." };
const result = JSON.stringify(world);
if (Buffer.byteLength(result) > 900 * 1024) throw Error(`Offline map exceeds hot-update budget (${Buffer.byteLength(result)} bytes)`);
await writeFile(target,result+"\n");
console.log(`Offline China map: ${world.china.provinces.length} provinces, ${world.china.cities.length} city regions, ${Buffer.byteLength(result)} bytes`);
