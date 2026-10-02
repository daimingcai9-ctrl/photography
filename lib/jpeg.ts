/** Remove APP1–APP13/comments from a canvas JPEG (Chrome can add an ICC APP2). */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("图片转换失败");
  const segments: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2, finished = false;
  while (offset + 4 <= bytes.length) {
    const start = offset;
    if (bytes[offset] !== 0xff) throw new Error("JPEG 文件损坏");
    let marker = bytes[offset + 1];
    while (marker === 0xff) { offset++; marker = bytes[offset + 1]; }
    offset += 2;
    if (marker === 0xda) {
      if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("JPEG 文件不完整");
      segments.push(bytes.subarray(start)); finished = true; break;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG 文件损坏");
    offset += length;
    if (!((marker >= 0xe1 && marker <= 0xed) || marker === 0xfe)) segments.push(bytes.subarray(start, offset));
  }
  if (!finished) throw new Error("JPEG 文件不完整");
  const result = new Uint8Array(segments.reduce((size, segment) => size + segment.length, 0));
  let position = 0;
  for (const segment of segments) { result.set(segment, position); position += segment.length; }
  return result;
}
