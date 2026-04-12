import https from "https";
import { URL } from "url";

const sourceUrl = new URL("https://xn--80adth0aefm3i.xn--j1amh/html-%D0%BA%D0%BE%D0%BB%D1%8C%D0%BE%D1%80%D0%B8");

const fetchHtml = () =>
  new Promise((resolve, reject) => {
    https.get(sourceUrl, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });

const run = async () => {
  const html = await fetchHtml();
  const hexMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
  const rgbMatches = html.match(/rgb\([^\)]*\)/g) || [];
  console.log('hex count', new Set(hexMatches).size);
  console.log('rgb count', new Set(rgbMatches).size);
  console.log('sample hex', Array.from(new Set(hexMatches)).slice(0, 20));
  console.log('sample rgb', Array.from(new Set(rgbMatches)).slice(0, 20));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
