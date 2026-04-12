import fs from "fs";
import path from "path";
import https from "https";
import { URL, fileURLToPath } from "url";

const sourceUrl = new URL("https://xn--80adth0aefm3i.xn--j1amh/html-%D0%BA%D0%BE%D0%BB%D1%8C%D0%BE%D1%80%D0%B8");
const cssColorsUrl = new URL("https://raw.githubusercontent.com/bahamas10/css-color-names/master/css-color-names.json");
const outputPath = fileURLToPath(new URL("../data/html-colors.json", import.meta.url));

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Fetch failed: ${url.href} (${res.statusCode})`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });

const createKey = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

const hexToRgb = (hex) => {
  const cleaned = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return null;
  return [parseInt(cleaned.slice(0, 2), 16), parseInt(cleaned.slice(2, 4), 16), parseInt(cleaned.slice(4, 6), 16)];
};

const parseHtmlColorObject = (html) => {
  const match = html.match(/(?:var|const|let)\s+HTMLColor\s*=\s*\{([\s\S]*?)\};/);
  if (!match) {
    throw new Error("HTMLColor object not found in source page");
  }
  const body = match[1];
  const colorsMatch = body.match(/colors\s*:\s*(\[[\s\S]*?\])\s*,\s*ctx\s*:/);
  if (!colorsMatch) {
    throw new Error("Cannot extract colors array from HTMLColor object");
  }
  const colorsText = colorsMatch[1];
  return new Function(`return ${colorsText};`)();
};

const buildPalette = async () => {
  const html = await fetchText(sourceUrl);
  const cssColorsJson = await fetchText(cssColorsUrl);
  const cssColorMap = JSON.parse(cssColorsJson);
  const cssNameToHex = new Map(Object.entries(cssColorMap).map(([name, hex]) => [name.toLowerCase(), hex.toUpperCase()]));

  const categories = parseHtmlColorObject(html);
  const results = [];
  const seen = new Set();

  for (const category of categories) {
    const groupName = String(category.name || "").trim();
    if (!Array.isArray(category.colors)) continue;

    for (const color of category.colors) {
      if (!color || !color.en || !color.uk) continue;
      const en = String(color.en).trim();
      const uk = String(color.uk).trim();
      const key = createKey(en);
      if (!key || seen.has(key)) continue;

      const hex = cssNameToHex.get(en.toLowerCase());
      if (!hex) {
        console.warn(`Skipping color without CSS hex mapping: ${en}`);
        continue;
      }
      const rgb = hexToRgb(hex);
      if (!rgb) continue;

      seen.add(key);
      results.push({
        key,
        name: { ua: uk, en },
        hex,
        rgb,
        slug: key,
        group: groupName || null,
        isActive: true,
      });
    }
  }

  return results;
};

const run = async () => {
  console.log(`Building color palette from ${sourceUrl.href}`);
  const colors = await buildPalette();
  if (!colors.length) {
    throw new Error("No colors parsed from source page.");
  }
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(colors, null, 2), "utf-8");
  console.log(`Saved ${colors.length} colors to ${outputPath}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
