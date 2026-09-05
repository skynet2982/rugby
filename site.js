"use strict";

const DATA = { top14: "data/top14.json", prod2: "data/prod2.json" };
const REFRESH_MS = 30000;

const state = {
  comp: "top14",
  data: null,
  timer: null,
};

const $ = (sel) => document.querySelector(sel);

function setStatus(text, kind) {
  const dot = $("#statusDot");
  const txt = $("#statusText");
  txt.textContent = text;
  dot.className = "status__dot" + (kind ? " " + kind : "");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function parseDateISO(s) {
  return s ? new Date(s) : null;
}

function matchState(m) {
  const now = Date.now();
  const t1s = parseDateISO(m.timer && m.timer.firstPeriodStartDate);
  const t1e = parseDateISO(m.timer && m.timer.firstPeriodEndDate);
  const t2s = parseDateISO(m.timer && m.timer.secondPeriodStartDate);
  const t2e = parseDateISO(m.timer && m.timer.secondPeriodEndDate);

  if (m.postponed) return { key: "postponed", label: "Reporté" };

  if (t1s && !t1e && !t2s && now >= t1s.getTime()) {
    const minute = Math.min(
      40,
      Math.floor((now - t1s.getTime()) / 60000) + 1
    );
    return { key: "live", label: `${minute}ʹ` };
  }

  if (t1s && t1e && t2s && !t2e) {
    const minute = Math.min(
      80,
      40 + Math.floor((now - t2s.getTime()) / 60000) + 1
    );
    return { key: "live", label: `${minute}ʹ` };
  }

  if (t1e && t2s && t2e && now >= t2e.getTime()) {
    return { key: "finished", label: "Terminé" };
  }

  if (t1e && !t2s) return { key: "halftime", label: "Mi-temps" };

  return { key: "upcoming", label: "" };
}

function renderMatches(matches) {
  const box = $("#matches");
  if (!matches.length) {
    box.innerHTML = `<div class="empty">Aucun match de programmé pour le moment.</div>`;
    return;
  }

  const html = matches
    .map((m) => {
      const st = matchState(m);
      const live = st.key === "live";
      const kickoff = m.postponed
        ? "—"
        : `${esc(m.date)} · ${esc(m.time)}`;
      const scoreShown =
        st.key === "finished" || live || parseInt(m.score[0], 10) > 0 || parseInt(m.score[1], 10) > 0;
      const statusLabel =
        st.key === "upcoming"
          ? kickoff
          : `<span class="match__dot"></span>${st.label}`;
      return `
      <article class="match${live ? " is-live" : ""}">
        <div class="match__top">
          <span class="match__date">${esc(m.date)}</span>
          <span class="match__status">${statusLabel}</span>
        </div>
        <div class="match__line">
          ${team(m.home, "home")}
          <div class="match__score">
            ${scoreShown ? `<span class="match__score-vals">${m.score[0]}–${m.score[1]}</span>` : `<span class="match__score-vals">–</span>`}
            <span class="match__kickoff">${esc(m.time)}</span>
          </div>
          ${team(m.away, "away")}
        </div>
        ${
          m.broadcasters && m.broadcasters.length
            ? `<div class="match__broadcast">${m.broadcasters.map(esc).join(" · ")}</div>`
            : ""
        }
      </article>`;
    })
    .join("");

  box.innerHTML = html;
}

function team(t, side) {
  return `
    <div class="team team--${side}">
      <span class="team__badge"><img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()" /></span>
      <span class="team__name">${esc(t.name)}</span>
    </div>`;
}

function renderStandings(list) {
  const tb = $("#standings");
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="9"><div class="empty">Classement indisponible pour le moment.</div></td></tr>`;
    return;
  }
  tb.innerHTML = list
    .map((r) => {
      const posClass =
        r.rank <= 2 ? "pos-top" : r.rank >= list.length - 1 ? "pos-releg" : "pos-mid";
      return `
      <tr>
        <td class="num"><span class="rank-pill ${posClass}">${r.rank}</span></td>
        <td class="club">
          <span class="club-cell">
            ${
              r.logo
                ? `<span class="cbadge"><img src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.remove()" /></span>`
                : ""
            }
            <span>${esc(r.club)}</span>
          </span>
        </td>
        <td class="num"><strong>${r.pts}</strong></td>
        <td class="num">${r.played}</td>
        <td class="num">${r.won}</td>
        <td class="num">${r.drawn}</td>
        <td class="num">${r.lost}</td>
        <td class="num">${r.bonus}</td>
        <td class="num">${formatDiff(r.diff)}</td>
      </tr>`;
    })
    .join("");
}

function formatDiff(d) {
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return esc(d);
  return (n > 0 ? "+" : "") + n;
}

function render() {
  const d = state.data;
  if (!d) return;
  renderMatches(d.matches || []);
  renderStandings(d.standings || []);
  const updated = new Date(d.updatedAt);
  const ago = Math.max(0, Math.round((Date.now() - updated.getTime()) / 60000));
  const meta = `màj ${ago} min`;
  $("#liveMeta").textContent = meta;
  $("#standingsMeta").textContent = meta;
}

async function load() {
  try {
    const res = await fetch(DATA[state.comp], { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    state.data = d;
    render();
    setStatus("sync", "ok");
  } catch (err) {
    setStatus("erreur de synchro", "err");
  }
}

function switchComp(comp) {
  if (comp === state.comp) return;
  state.comp = comp;
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.comp === comp);
  });
  load();
}

function init() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) switchComp(btn.dataset.comp);
  });
  load();
  setInterval(load, REFRESH_MS);
}

init();