"use strict";

const DATA = { top14: "data/top14.json", prod2: "data/prod2.json" };
const CALENDAR_DATA = {
  top14: "data/top14-calendar.json",
  prod2: "data/prod2-calendar.json",
};
const REFRESH_MS = 30000;

const state = {
  comp: "top14",
  data: null,
  calendar: null,
  calendarIndex: 0,
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

function renderMatchCard(m) {
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
}

function renderMatches(matches) {
  const box = $("#matches");
  if (!matches.length) {
    box.innerHTML = `<div class="empty">Aucun match de programmé pour le moment.</div>`;
    return;
  }

  const played = [];
  const upcoming = [];
  matches.forEach((m) => {
    (matchState(m).key === "upcoming" ? upcoming : played).push(m);
  });

  let html = "";
  if (played.length) {
    html += `<div class="match-group__label">Résultats</div>`;
    html += played.map(renderMatchCard).join("");
  }
  if (upcoming.length) {
    html += `<div class="match-group__label">À venir</div>`;
    html += upcoming.map(renderMatchCard).join("");
  }

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

function defaultMatchdayIndex(matchdays) {
  for (let i = 0; i < matchdays.length; i++) {
    if (matchdays[i].matches.some((m) => !m.score)) return i;
  }
  return Math.max(0, matchdays.length - 1);
}

function renderCalendar() {
  const cal = state.calendar;
  const nav = $("#calNav");
  const box = $("#calMatches");
  if (!cal || !cal.matchdays.length) {
    nav.innerHTML = "";
    box.innerHTML = `<div class="empty">Calendrier indisponible pour le moment.</div>`;
    return;
  }

  const idx = state.calendarIndex;
  const day = cal.matchdays[idx];

  nav.innerHTML = `
    <button class="cal-nav__btn" id="calPrev" ${idx === 0 ? "disabled" : ""} aria-label="Journée précédente">‹</button>
    <span class="cal-nav__label">${esc(day.code || "")}</span>
    <button class="cal-nav__btn" id="calNext" ${idx === cal.matchdays.length - 1 ? "disabled" : ""} aria-label="Journée suivante">›</button>
  `;

  let lastDate = null;
  const rows = day.matches
    .map((m) => {
      const dateHtml =
        m.date !== lastDate
          ? ((lastDate = m.date), `<div class="cal-date">${esc(m.date)}</div>`)
          : "";
      const result = m.score
        ? `${m.score[0]}–${m.score[1]}`
        : m.time
        ? esc(m.time)
        : "—";
      return `
        ${dateHtml}
        <div class="cal-row">
          <span class="cal-team cal-team--home">${esc(m.home)}</span>
          <span class="cal-result">${result}</span>
          <span class="cal-team cal-team--away">${esc(m.away)}</span>
          ${m.broadcaster ? `<span class="cal-bc">${esc(m.broadcaster)}</span>` : ""}
        </div>`;
    })
    .join("");

  box.innerHTML = rows;
}

async function loadCalendar() {
  try {
    const res = await fetch(CALENDAR_DATA[state.comp], { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    state.calendar = d;
    state.calendarIndex = defaultMatchdayIndex(d.matchdays);
    renderCalendar();
  } catch (err) {
    $("#calNav").innerHTML = "";
    $("#calMatches").innerHTML = `<div class="empty">Calendrier indisponible pour le moment.</div>`;
  }
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
  loadCalendar();
}

function init() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) switchComp(btn.dataset.comp);
  });
  $("#calNav").addEventListener("click", (e) => {
    const cal = state.calendar;
    if (!cal) return;
    if (e.target.closest("#calPrev") && state.calendarIndex > 0) {
      state.calendarIndex--;
      renderCalendar();
    }
    if (
      e.target.closest("#calNext") &&
      state.calendarIndex < cal.matchdays.length - 1
    ) {
      state.calendarIndex++;
      renderCalendar();
    }
  });
  load();
  loadCalendar();
  setInterval(load, REFRESH_MS);
}

init();