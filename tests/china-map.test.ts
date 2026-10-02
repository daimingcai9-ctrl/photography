import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const world = JSON.parse(readFileSync("android/app/src/main/assets/ui/world-land.geojson", "utf8"));
const script = readFileSync("android/app/src/main/assets/ui/app.js", "utf8");
const lookup = script.slice(script.indexOf("  // Offline city lookup:"), script.indexOf("  // End offline city lookup."));
const context = vm.createContext({ world });
vm.runInContext(lookup, context);
const city = (lat: number, lng: number) => vm.runInContext(`cityName(${lat},${lng})`, context);

test("offline city polygons identify municipalities and neighboring cities without sending GPS", () => {
  for (const [name,lat,lng] of [
    ["上海",31.23,121.47],["重庆",29.55,106.55],["北京",39.91,116.40],
    ["深圳",22.54,114.06],["广州",23.13,113.26],["东莞",23.02,113.75],
    ["杭州",30.27,120.15],["成都",30.66,104.07],["揭阳",23.55,116.37]
  ] as const) assert.equal(city(lat,lng),name);
  assert.equal(city(0,0),null);
  assert.equal(city(48.86,2.35),null);
  assert.equal(city(90.1,121.47),null);
  assert.equal(city(NaN,114.06),null);
});

test("offline map remains licensed and fits the existing signed hot-update protocol", () => {
  const bytes=readFileSync("android/app/src/main/assets/ui/world-land.geojson");
  assert.ok(bytes.length<1024*1024);
  assert.ok(world.china.provinces.length>=34);
  assert.ok(world.china.cities.length>300);
  assert.match(world.china.license,/MIT License/);
  assert.match(world.china.license,/2025/);
  assert.equal(world.china.revision,"5822c4c0a0bdfd73327f9454976c8661bfd6ad9f");
  assert.ok(world.china.provinces.some((f: {properties:{name:string}})=>f.properties.name==="台湾省"));
});
