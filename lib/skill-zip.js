/**
 * skill-zip.js — Minimal ZIP archive library for .pwskill packages
 *
 * Creates and reads ZIP archives without external dependencies.
 * Uses the standard ZIP format (local file headers + central directory).
 * Compatible with both browser (Chrome Extension) and Node.js test environments.
 *
 * NOTE: This is an uncompressed ZIP (STORE method) for simplicity and
 * compatibility. Compression can be added later via Compression Streams API.
 */

// ==================== CRC32 ====================

/** CRC32 lookup table (generated on first use) */
let crc32Table = null

function getCrc32Table() {
  if (crc32Table) return crc32Table
  crc32Table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crc32Table[i] = c
  }
  return crc32Table
}

/**
 * Compute CRC32 checksum of a Uint8Array
 * @param {Uint8Array} data
 * @returns {number} CRC32 value
 */
export function crc32(data) {
  const table = getCrc32Table()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ==================== Text Encoding ====================

/**
 * Encode string to Uint8Array (UTF-8)
 * Works in both browser and Node.js
 * @param {string} str
 * @returns {Uint8Array}
 */
function strToBytes(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str)
  }
  // Fallback for environments without TextEncoder
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    } else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }
  return new Uint8Array(bytes)
}

/**
 * Decode Uint8Array to string (UTF-8)
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToStr(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes)
  }
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x80) {
      str += String.fromCharCode(b)
    } else if (b < 0xE0) {
      str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[++i] & 0x3F))
    } else {
      str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F))
    }
  }
  return str
}

// ==================== ZIP Writer ====================

/** ZIP local file header signature */
const LOCAL_HEADER_SIG = 0x04034B50
/** ZIP central directory header signature */
const CENTRAL_HEADER_SIG = 0x02014B50
/** ZIP end of central directory signature */
const EOCD_SIG = 0x06054B50

/**
 * Write a 16-bit little-endian value
 */
function writeU16(buf, offset, value) {
  buf[offset] = value & 0xFF
  buf[offset + 1] = (value >> 8) & 0xFF
}

/**
 * Write a 32-bit little-endian value
 */
function writeU32(buf, offset, value) {
  buf[offset] = value & 0xFF
  buf[offset + 1] = (value >> 8) & 0xFF
  buf[offset + 2] = (value >> 16) & 0xFF
  buf[offset + 3] = (value >>> 24) & 0xFF
}

/**
 * Read a 16-bit little-endian value
 */
function readU16(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8)
}

/**
 * Read a 32-bit little-endian value
 */
function readU32(buf, offset) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
}

/**
 * Create a ZIP archive from file entries
 *
 * @param {Array<{name: string, content: string|Uint8Array}>} files
 * @returns {Uint8Array} ZIP archive data
 */
export function createZip(files) {
  // Encode all file contents
  const entries = files.map(f => {
    const nameBytes = strToBytes(f.name)
    const contentBytes = typeof f.content === 'string' ? strToBytes(f.content) : f.content
    const checksum = crc32(contentBytes)
    return { nameBytes, contentBytes, checksum }
  })

  // Calculate total size
  let totalSize = 0
  const localHeaders = entries.map(entry => {
    const headerSize = 30 + entry.nameBytes.length
    const offset = totalSize
    totalSize += headerSize + entry.contentBytes.length
    return { ...entry, offset, headerSize }
  })

  // Central directory
  let centralOffset = totalSize
  let centralSize = 0
  const centralHeaders = localHeaders.map(entry => {
    const headerSize = 46 + entry.nameBytes.length
    const offset = centralOffset + centralSize
    centralSize += headerSize
    return { ...entry, centralOffset: offset }
  })

  // End of central directory
  const eocdSize = 22
  const totalArchiveSize = totalSize + centralSize + eocdSize
  const buf = new Uint8Array(totalArchiveSize)
  let pos = 0

  // Write local file headers + data
  for (const entry of localHeaders) {
    writeU32(buf, pos, LOCAL_HEADER_SIG)         // signature
    writeU16(buf, pos + 4, 20)                    // version needed (2.0)
    writeU16(buf, pos + 6, 0)                     // general flags
    writeU16(buf, pos + 8, 0)                     // compression method (STORE)
    writeU16(buf, pos + 10, 0)                    // mod time
    writeU16(buf, pos + 12, 0)                    // mod date
    writeU32(buf, pos + 14, entry.checksum)       // CRC32
    writeU32(buf, pos + 18, entry.contentBytes.length)  // compressed size
    writeU32(buf, pos + 22, entry.contentBytes.length)  // uncompressed size
    writeU16(buf, pos + 26, entry.nameBytes.length)     // filename length
    writeU16(buf, pos + 28, 0)                          // extra field length
    pos += 30

    // Filename
    buf.set(entry.nameBytes, pos)
    pos += entry.nameBytes.length

    // File data
    buf.set(entry.contentBytes, pos)
    pos += entry.contentBytes.length
  }

  // Write central directory headers
  for (const entry of centralHeaders) {
    writeU32(buf, pos, CENTRAL_HEADER_SIG)       // signature
    writeU16(buf, pos + 4, 20)                    // version made by
    writeU16(buf, pos + 6, 20)                    // version needed
    writeU16(buf, pos + 8, 0)                     // general flags
    writeU16(buf, pos + 10, 0)                    // compression method
    writeU16(buf, pos + 12, 0)                    // mod time
    writeU16(buf, pos + 14, 0)                    // mod date
    writeU32(buf, pos + 16, entry.checksum)       // CRC32
    writeU32(buf, pos + 20, entry.contentBytes.length)  // compressed size
    writeU32(buf, pos + 24, entry.contentBytes.length)  // uncompressed size
    writeU16(buf, pos + 28, entry.nameBytes.length)     // filename length
    writeU16(buf, pos + 30, 0)                          // extra field length
    writeU16(buf, pos + 32, 0)                          // file comment length
    writeU16(buf, pos + 34, 0)                          // disk number start
    writeU16(buf, pos + 36, 0)                          // internal attrs
    writeU32(buf, pos + 38, 0)                          // external attrs
    writeU32(buf, pos + 42, entry.offset)               // local header offset
    pos += 46

    // Filename
    buf.set(entry.nameBytes, pos)
    pos += entry.nameBytes.length
  }

  // Write end of central directory
  writeU32(buf, pos, EOCD_SIG)                    // signature
  writeU16(buf, pos + 4, 0)                       // disk number
  writeU16(buf, pos + 6, 0)                       // disk with central dir
  writeU16(buf, pos + 8, entries.length)           // entries on this disk
  writeU16(buf, pos + 10, entries.length)          // total entries
  writeU32(buf, pos + 12, centralSize)             // central dir size
  writeU32(buf, pos + 16, totalSize)               // central dir offset
  writeU16(buf, pos + 20, 0)                       // comment length

  return buf
}

// ==================== ZIP Reader ====================

/**
 * Extract files from a ZIP archive
 *
 * @param {Uint8Array} data - ZIP archive data
 * @returns {Array<{name: string, content: Uint8Array}>} Extracted files
 */
export function readZip(data) {
  const files = []

  // Find end of central directory
  let eocdOffset = -1
  for (let i = data.length - 22; i >= 0; i--) {
    if (readU32(data, i) === EOCD_SIG) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP: missing end of central directory')
  }

  const centralDirOffset = readU32(data, eocdOffset + 16)
  const numEntries = readU16(data, eocdOffset + 10)

  // Read central directory entries
  let pos = centralDirOffset
  for (let i = 0; i < numEntries; i++) {
    if (readU32(data, pos) !== CENTRAL_HEADER_SIG) {
      throw new Error(`Invalid ZIP: bad central directory header at offset ${pos}`)
    }

    const compressionMethod = readU16(data, pos + 10)
    const compressedSize = readU32(data, pos + 20)
    const uncompressedSize = readU32(data, pos + 24)
    const nameLength = readU16(data, pos + 28)
    const localOffset = readU32(data, pos + 42)

    const name = bytesToStr(data.slice(pos + 46, pos + 46 + nameLength))

    // Read data from local file header
    const dataOffset = localOffset + 30 + readU16(data, localOffset + 26) + readU16(data, localOffset + 28)
    const fileData = data.slice(dataOffset, dataOffset + compressedSize)

    if (compressionMethod === 0) {
      // STORE (no compression)
      files.push({ name, content: new Uint8Array(fileData) })
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`)
    }

    pos += 46 + nameLength
  }

  return files
}

/**
 * Convenience: read a ZIP and return files as strings
 * @param {Uint8Array} data
 * @returns {Array<{name: string, content: string}>}
 */
export function readZipAsText(data) {
  return readZip(data).map(f => ({
    name: f.name,
    content: bytesToStr(f.content)
  }))
}
