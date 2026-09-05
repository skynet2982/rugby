const fs = require("node:fs");
const path = require("node:path");
const { unescapeHtml } = require("./util");

const UA =
  "Mozilla/5.0 (compatible; rugby-ticker/1.0; +https://github.com/skynet2982/rugby)";

const COMPETITIONS = [
  { id: "top14", name: "TOP 14", base: "https://top14.lnr.fr" },
  { id: "prod2", name: "Pro D2", base: "https://prod2.lnr.fr" },
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

function parseMatches(html) {
  const raw = html.match(/:matches\s*=\s*'([^']*)'/);
  if (!raw) throw new Error("matches prop not found");
  const matches = JSON.parse(unescapeHtml(raw[1]));
  return matches.map((m) => ({
    id: m.id,
    home: {
      name: m.hosting_club.name,
      acronym: m.hosting_club.acronym,
      logo: m.hosting_club.logo.original,
    },
    away: {
      name: m.visiting_club.name,
      acronym: m.visiting_club.acronym,
      logo: m.visiting_club.logo.original,
    },
    date: m.date,
    time: m.time,
    broadcasters: (m.broadcasters || []).map((b) => b.name),
    status: m.status,
    score: m.score,
    link: m.link,
    timer: m.timer,
    postponed: !!m.is_postponed,
  }));
}

function innerText(block, startTag, endTag) {
  const s = block.indexOf(startTag);
  if (s === -1) return null;
  const e = block.indexOf(endTag, s + startTag.length);
  if (e === -1) return null;
  return block
    .slice(s + startTag.length, e)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseStandings(html) {
  const reRow = /table-line--ranking-scrollable/g;
  const starts = [...html.matchAll(reRow)].map((m) => m.index);
  if (!starts.length) return [];

  const rows = starts.map((s, i) =>
    html.slice(s, i + 1 < starts.length ? starts[i + 1] : html.length)
  );

  const reFixed = /table-line--ranking-fixed/g;
  const fStarts = [...html.matchAll(reFixed)].map((m) => m.index);
  const fixedBlocks = fStarts.map((s, i) =>
    html.slice(s, i + 1 < fStarts.length ? fStarts[i + 1] : html.length)
  );

  const standings = [];
  rows.forEach((row, idx) => {
    const name = innerText(row, 'class="base-link base-link--black">', "</a>");
    const cellRe = /table-line__cell-wrapper--small[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/g;
    const cells = [...row.matchAll(cellRe)].map((m) => valueOf(m[1]));
    let rank = 0;
    let logo = null;
    const fb = fixedBlocks[idx];
    if (fb) {
      const rm = fb.match(/ranking-item__rank[^>]*>\s*(\d+)/);
      rank = rm ? +rm[1] : 0;
      const im = fb.match(/<img[\s\S]*?alt="([^"]*)"[\s\S]*?src="([^"]*)"/);
      if (im) logo = { name: im[1], src: im[2] };
    }
    standings.push({
      rank,
      club: name || (logo && logo.name) || "",
      logo: logo ? logo.src : null,
      pts: cells[0] ?? 0,
      played: cells[1] ?? 0,
      won: cells[2] ?? 0,
      drawn: cells[3] ?? 0,
      lost: cells[4] ?? 0,
      bonus: cells[5] ?? 0,
      for: cells[6] ?? 0,
      against: cells[7] ?? 0,
      diff: cells[8] ?? 0,
    });
  });
  return standings;
}

function valueOf(whitespacey) {
  if (whitespacey == null) return 0;
  const n = Number(whitespacey.trim());
  return Number.isFinite(n) ? n : whitespacey.trim();
}

async function scrapeCompetition(comp) {
  const html = await fetchText(`${comp.base}/actualites/en-direct`);
  const matches = parseMatches(html);

  let standings = [];
  try {
    const classHtml = await fetchText(`${comp.base}/classement`);
    standings = parseStandings(classHtml);
  } catch (err) {
    console.warn(`[${comp.id}] classement failed: ${err.message}`);
  }

  return {
    competition: comp.id,
    name: comp.name,
    updatedAt: new Date().toISOString(),
    matches,
    standings,
  };
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  for (const comp of COMPETITIONS) {
    const data = await scrapeCompetition(comp);
    fs.writeFileSync(
      path.join(outDir, `${comp.id}.json`),
      JSON.stringify(data, null, 2)
    );
    console.log(
      `[${comp.id}] ${data.matches.length} matches, ${data.standings.length} standings`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});