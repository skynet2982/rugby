const fs = require("node:fs");
const path = require("node:path");

const UA =
  "Mozilla/5.0 (compatible; rugby-ticker/1.0; +https://github.com/skynet2982/rugby)";

const COMPETITIONS = [
  { id: "top14", url: "https://www.allrugby.com/competitions/top-14/calendrier.html" },
  { id: "prod2", url: "https://www.allrugby.com/competitions/pro-d2/calendrier.html" },
];

async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,*/*" },
      });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw lastErr;
}

function divText(html, className) {
  const m = html.match(new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`));
  if (!m) return null;
  return m[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseCalendar(html) {
  const starts = [...html.matchAll(/<div class="journee carousel-cell">/g)].map(
    (m) => m.index
  );
  const blocks = starts.map((s, i) =>
    html.slice(s, i + 1 < starts.length ? starts[i + 1] : html.length)
  );

  return blocks.map((block) => {
    const titreMatch = block.match(/<div class="titre"[^>]*>([^<]*)<\/div>/);
    const code = titreMatch ? titreMatch[1].trim() : null;

    const matches = [];
    let currentDate = null;
    const itemRe =
      /<li class="sep_dat[^"]*">([^<]*)<\/li>|<li class="clearfix">([\s\S]*?)<\/li>/g;
    let m;
    while ((m = itemRe.exec(block))) {
      if (m[1] !== undefined) {
        currentDate = m[1].trim();
        continue;
      }
      const chunk = m[2];
      const home = divText(chunk, "fl log txtright");
      const away = divText(chunk, "fl log txtleft");
      const res = divText(chunk, "fl res txtcenter");

      let score = null;
      let time = null;
      if (res) {
        const scoreMatch = res.match(/^(\d+)\s*-\s*(\d+)$/);
        if (scoreMatch) score = [+scoreMatch[1], +scoreMatch[2]];
        else time = res;
      }

      const bcMatch = chunk.match(/class="fr cha"[\s\S]*?alt="([^"]*)"/);
      const linkMatch = chunk.match(/<a class="mat" href="([^"]*)"/);

      matches.push({
        date: currentDate,
        time,
        home,
        away,
        score,
        broadcaster: bcMatch ? bcMatch[1] : null,
        link: linkMatch ? linkMatch[1] : null,
      });
    }
    return { code, matches };
  });
}

async function scrapeCompetition(comp) {
  const html = await fetchText(comp.url);
  const matchdays = parseCalendar(html);
  return {
    competition: comp.id,
    updatedAt: new Date().toISOString(),
    matchdays,
  };
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  for (const comp of COMPETITIONS) {
    const data = await scrapeCompetition(comp);
    fs.writeFileSync(
      path.join(outDir, `${comp.id}-calendar.json`),
      JSON.stringify(data, null, 2)
    );
    const total = data.matchdays.reduce((n, d) => n + d.matches.length, 0);
    console.log(
      `[${comp.id}] ${data.matchdays.length} journées, ${total} matches`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
