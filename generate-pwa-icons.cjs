const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Lightweight PNG encoder in pure Node without external dependencies
function createPNG(width, height, drawFn) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crcVal = crc32(typeAndData);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

// Draw Brand Icon: "KITA" / Glowing financial spark icon on dark background (#18181b)
function drawAppIcon(x, y, width, height, isMaskable = false) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background: Dark slate (#18181b / #09090b)
  let bgR = 24, bgG = 24, bgB = 27, bgA = 255;
  if (!isMaskable) {
    // Soft squircle or rounded rect aesthetic
    const cornerR = width * 0.22;
    const nx = Math.abs(dx) - (cx - cornerR);
    const ny = Math.abs(dy) - (cy - cornerR);
    if (nx > 0 && ny > 0) {
      const cornerDist = Math.sqrt(nx * nx + ny * ny);
      if (cornerDist > cornerR) {
        return [0, 0, 0, 0]; // transparent outside squircle
      }
    }
  }

  // Draw radial glow center
  const glowFactor = Math.max(0, 1 - dist / (width * 0.45));
  let r = Math.min(255, bgR + Math.round(glowFactor * 60));
  let g = Math.min(255, bgG + Math.round(glowFactor * 30));
  let b = Math.min(255, bgB + Math.round(glowFactor * 100));

  // Draw central stylized geometric 'K' / Spark symbol
  // Normalized coordinates: -1 to 1
  const u = dx / (width * 0.35);
  const v = dy / (height * 0.35);

  // Left vertical pillar of K: u in [-0.65, -0.3], v in [-0.7, 0.7]
  const inStem = (u >= -0.65 && u <= -0.28 && v >= -0.68 && v <= 0.68);
  
  // Diagonal top branch: v approx -u + 0.1
  const inTopBranch = (u >= -0.3 && u <= 0.65 && Math.abs(v - (-u * 0.85 - 0.05)) < 0.22);
  
  // Diagonal bottom branch: v approx u - 0.1
  const inBottomBranch = (u >= -0.3 && u <= 0.65 && Math.abs(v - (u * 0.85 + 0.05)) < 0.22);

  // Top right emerald dot / financial spark: near (0.5, -0.55)
  const sparkDx = u - 0.48;
  const sparkDy = v - (-0.52);
  const inSpark = Math.sqrt(sparkDx * sparkDx + sparkDy * sparkDy) < 0.18;

  if (inStem || inTopBranch || inBottomBranch) {
    // Violet-to-Indigo Gradient (#8B5CF6 to #6366F1)
    const t = (v + 0.7) / 1.4;
    return [
      Math.round(139 * (1 - t) + 99 * t),
      Math.round(92 * (1 - t) + 102 * t),
      Math.round(246 * (1 - t) + 241 * t),
      255
    ];
  }

  if (inSpark) {
    // Emerald Green Spark (#10B981)
    return [16, 185, 129, 255];
  }

  return [r, g, b, 255];
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate Apple Touch Icon (180x180)
const appleIcon = createPNG(180, 180, (x, y, w, h) => drawAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

// Generate 192x192
const pwa192 = createPNG(192, 192, (x, y, w, h) => drawAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);

// Generate 512x512
const pwa512 = createPNG(512, 512, (x, y, w, h) => drawAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);

// Generate 512x512 Maskable (Full Bleed)
const pwaMaskable = createPNG(512, 512, (x, y, w, h) => drawAppIcon(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskable);

console.log('Successfully generated all PWA PNG icons in /public: apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png');
