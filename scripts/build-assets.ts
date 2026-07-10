import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "assets", "src");
const isDev = process.argv.includes("--dev");

const hash = isDev
  ? "dev"
  : Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString("base64url");

const outDir = join(ROOT, "dist", "assets", hash);
const base = `/assets/${hash}`;

mkdirSync(join(outDir, "icons"), { recursive: true });
mkdirSync(join(outDir, "fonts"), { recursive: true });

const fontFiles = [
  ["@fontsource/inter", "inter-latin-400-normal.woff2"],
  ["@fontsource/inter", "inter-latin-500-normal.woff2"],
  ["@fontsource/inter", "inter-latin-600-normal.woff2"],
  ["@fontsource/inter", "inter-latin-700-normal.woff2"],
  ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2"],
  ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2"],
] as const;

for (const [pkg, file] of fontFiles) {
  cpSync(join(ROOT, "node_modules", pkg, "files", file), join(outDir, "fonts", file));
}

async function bundleJs(input: string, output: string, minify: boolean) {
  const result = await Bun.build({
    entrypoints: [input],
    minify,
    target: "browser",
    write: false,
  });
  if (!result.success) {
    throw new Error(`Failed to bundle ${input}`);
  }
  const outputFile = result.outputs[0];
  writeFileSync(output, await outputFile.text());
}

async function minifyCss(input: string, output: string) {
  if (isDev) {
    cpSync(input, output);
    return;
  }
  const css = readFileSync(input, "utf-8");
  const minified = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .trim();
  writeFileSync(output, minified);
}

// Download htmx if missing
const htmxSrc = join(SRC, "htmx.min.js");
if (!existsSync(htmxSrc)) {
  console.log("Fetching htmx.min.js...");
  const res = await fetch("https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js");
  writeFileSync(htmxSrc, await res.text());
}

const jsFiles = [
  "htmx.min.js",
  "e2e.js",
  "clip-sync.js",
  "clip-editor.js",
  "clip-mobile.js",
  "app.js",
];

for (const file of jsFiles) {
  const input = join(SRC, file);
  const output = join(outDir, file);
  if (file === "htmx.min.js") {
    cpSync(input, output);
  } else if (file === "app.js") {
    let content = readFileSync(input, "utf-8");
    content = content.replace("__SW_URL__", `${base}/sw.js`);
    const tmp = join(outDir, ".app.tmp.js");
    writeFileSync(tmp, content);
    await bundleJs(tmp, output, !isDev);
    Bun.spawnSync(["rm", tmp]);
  } else if (file === "clip-editor.js") {
    await bundleJs(input, output, !isDev);
  } else if (isDev) {
    cpSync(input, output);
  } else {
    await bundleJs(input, output, true);
  }
}

const cssBundle =
  readFileSync(join(SRC, "fonts.css"), "utf-8") +
  "\n" +
  readFileSync(join(SRC, "app.css"), "utf-8") +
  "\n" +
  readFileSync(join(SRC, "clip-ui.css"), "utf-8");
writeFileSync(join(outDir, "app.css"), isDev ? cssBundle : cssBundle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1").trim());

// Service worker from template
const swTemplate = readFileSync(join(SRC, "sw.template.js"), "utf-8");
const assetUrls = jsFiles
  .concat(["app.css", "manifest.json"])
  .concat(["icons/icon-192.png", "icons/icon-512.png"])
  .map((f) => `${base}/${f}`);

const swContent = swTemplate
  .replaceAll("__HASH__", hash)
  .replace("__ASSET_URLS__", JSON.stringify(assetUrls));

writeFileSync(join(outDir, "sw.js"), isDev ? swContent : swContent.replace(/\n\s*/g, "\n"));

// Manifest
const manifestTemplate = readFileSync(
  join(ROOT, "assets", "manifest.template.json"),
  "utf-8"
);
writeFileSync(
  join(outDir, "manifest.json"),
  manifestTemplate.replaceAll("__BASE__", base)
);

// Icons
await generateIcons(join(outDir, "icons"));

const manifest = { hash, base };
writeFileSync(join(ROOT, "dist", "asset-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Assets built → ${outDir}`);
console.log(`Manifest: ${JSON.stringify(manifest)}`);

async function generateIcons(iconsDir: string) {
  const iconsScript = join(ROOT, "scripts", "generate-icons.ts");
  if (existsSync(iconsScript)) {
    await import(iconsScript);
  } else {
    // Minimal 1x1 PNG placeholders if generate-icons not run
    for (const size of [192, 512]) {
      const path = join(iconsDir, `icon-${size}.png`);
      if (!existsSync(path)) {
        await createPlaceholderPng(path, size);
      }
    }
  }
  const srcIcons = join(SRC, "icons");
  if (existsSync(srcIcons)) {
    for (const f of readdirSync(srcIcons)) {
      cpSync(join(srcIcons, f), join(iconsDir, f));
    }
  }
}

async function createPlaceholderPng(path: string, size: number) {
  // Simple solid color PNG via canvas in bun - use minimal PNG bytes
  const { spawnSync } = await import("node:child_process");
  // Create SVG and convert - fallback: write a minimal valid PNG
  const png = createMinimalPng(size, size, 0x38, 0xbd, 0xf8);
  writeFileSync(path, png);
}

function createMinimalPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type: string, data: Buffer) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const i = y * rowSize + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }

  const compressed = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
