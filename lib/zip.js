// Tiny dependency-free ZIP writer using the STORE method (no compression).
// Good enough for portable research packages and avoids a runtime dependency.

const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function concat(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
  return { time, day };
}

export class ZipWriter {
  constructor() {
    this.entries = [];
  }

  addText(path, text) {
    this.addBytes(path, encoder.encode(text));
  }

  addBytes(path, bytes) {
    this.entries.push({ path, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) });
  }

  build() {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const { time, day } = dosDateTime();

    for (const entry of this.entries) {
      const name = encoder.encode(entry.path.replace(/^\/+/, ""));
      const data = entry.bytes;
      const crc = crc32(data);
      const localHeader = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04,
        ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)
      ]);
      localParts.push(localHeader, name, data);

      const centralHeader = new Uint8Array([
        0x50, 0x4b, 0x01, 0x02,
        ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
        ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      centralParts.push(centralHeader, name);
      offset += localHeader.length + name.length + data.length;
    }

    const local = concat(localParts);
    const central = concat(centralParts);
    const end = new Uint8Array([
      0x50, 0x4b, 0x05, 0x06,
      ...u16(0), ...u16(0), ...u16(this.entries.length), ...u16(this.entries.length),
      ...u32(central.length), ...u32(local.length), ...u16(0)
    ]);
    return concat([local, central, end]);
  }
}
