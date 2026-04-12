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
  console.log('HTML length:', html.length);
  console.log('Contains <table>:', html.includes('<table'));
  console.log('Contains <tbody>:', html.includes('<tbody'));
  console.log('Contains <tr>:', html.includes('<tr'));
  console.log('Contains class="table"?:', html.includes('class="table"') || html.includes("class='table'"));
  const snippet = html.slice(0, 10000);
  console.log(snippet);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
