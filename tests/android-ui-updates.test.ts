import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyUiUpdate, UI_FILES, digest, MAX_UPDATE_BYTES } from "../scripts/lib/android-ui-update.mjs";

test("published Android UI is pinned, signed, complete and matches the APK baseline", () => {
  const key = createPublicKey({ key: Buffer.from(readFileSync("android/app/src/main/assets/updates/public-key.txt", "utf8").trim(), "base64"), format: "der", type: "spki" });
  const { pack, files } = verifyUiUpdate(readFileSync("public/app-updates/stable.json"), key);
  const metadata = JSON.parse(readFileSync("android/app/src/main/assets/updates/builtin.json", "utf8"));
  assert.equal(metadata.version, pack.version);
  assert.equal(metadata.protocol, pack.protocol);
  assert.equal(files.size, 5);
  for (const name of UI_FILES) assert.deepEqual(files.get(name), readFileSync(`android/app/src/main/assets/ui/${name}`));
});

test("reject unsigned, tampered, incompatible, traversal, hash and oversized UI packages", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const files = UI_FILES.map((name) => {
    const bytes = Buffer.from(`test:${name}`);
    return { name, size: bytes.length, sha256: digest(bytes), content: bytes.toString("base64") };
  });
  const original = { format: "hhs-ui-v1", protocol: 1, version: 1, release: "test", notes: "test", files };
  const encode = (value: typeof original) => {
    const payload = JSON.stringify(value);
    return Buffer.from(JSON.stringify({ payload, signature: sign("sha256", Buffer.from(payload), privateKey).toString("base64") }));
  };
  assert.equal(verifyUiUpdate(encode(original), publicKey).files.size, 5);
  const tampered = JSON.parse(encode(original).toString());
  tampered.payload = tampered.payload.replace('"release":"test"', '"release":"evil"');
  assert.throws(() => verifyUiUpdate(Buffer.from(JSON.stringify(tampered)), publicKey), /signature/);
  assert.throws(() => verifyUiUpdate(encode({ ...original, protocol: 2 }), publicKey), /protocol/);
  assert.throws(() => verifyUiUpdate(encode({ ...original, files: files.map((f, i) => i ? f : { ...f, name: "../private.db" }) }), publicKey), /file/);
  assert.throws(() => verifyUiUpdate(encode({ ...original, files: files.map((f, i) => i ? f : { ...f, sha256: "0".repeat(64) }) }), publicKey), /hash/);
  assert.throws(() => verifyUiUpdate(Buffer.alloc(MAX_UPDATE_BYTES + 1), publicKey), /limit/);
  const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
  assert.throws(() => verifyUiUpdate(encode(original), otherKey), /signature/);
});
