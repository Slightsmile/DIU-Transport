// app.js
// Loads the Excel file (Summer 2025 Final Exam transport schedule) from GitHub/local URL.
// Parses it in the browser using SheetJS and builds a searchable, filterable UI.

const EXCEL_URL = "Transport Schedule Final Exam Semester-Summer-2025.xlsx";

const state = {
  all: [],
  regular: [],
  friday: [],
  meta: { heading: "", lastUpdate: "" },
};

const els = {
  selectRoute: null,
  inputSearch: null,
  toggleFriday: null,
  results: null,
  excelHeading: null,
  lastUpdate: null,
};

document.addEventListener("DOMContentLoaded", () => {
  els.selectRoute = document.getElementById("routeSelect");
  els.inputSearch = document.getElementById("searchInput");
  els.toggleFriday = document.getElementById("fridayToggle");
  els.results = document.getElementById("results");
  els.excelHeading = document.getElementById("excelHeading");
  els.lastUpdate = document.getElementById("lastUpdate");

  // Wire events
  els.selectRoute.addEventListener("change", render);
  els.inputSearch.addEventListener("input", render);
  els.toggleFriday.addEventListener("change", () => {
    populateRouteDropdown();
    render();
  });

  // 🔹 Always load from GitHub/local path
  loadExcelFromURL(EXCEL_URL);
});

async function loadExcelFromURL(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Excel file not found");
    const ab = await resp.arrayBuffer();
    readWorkbookFromArrayBuffer(ab);
    state.meta.lastUpdate = "N/A"; // GitHub doesn't give last-modified reliably
  } catch (err) {
    console.error(err);
    alert("Couldn't load Excel file from URL.");
  }
}

function readWorkbookFromArrayBuffer(ab) {
  const wb = XLSX.read(ab, { type: "array" });
  ingestWorkbook(wb);
}

function ingestWorkbook(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Extract heading cell (A1) to show in footer
  state.meta.heading = (sheet["A1"]?.v || "").toString().trim();

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  const { regular, friday } = parseSchedule(rows);
  state.regular = regular;
  state.friday = friday;
  state.all = [...regular, ...friday];

  populateRouteDropdown();
  updateFooter();
  render();
}

function parseSchedule(rows) {
  const headerRegex = /route\s*no/i;
  const fridayMarker = /friday\s*schedule/i;
  let mode = "regular";

  const routesRegular = [];
  const routesFriday = [];
  let current = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const c0 = (row[0] || "").toString().trim();
    const c1 = row[1];
    const c2 = (row[2] || "").toString().trim();
    const c3 = (row[3] || "").toString().trim();
    const c4 = row[4];

    if (!c0 && !c1 && !c2 && !c3 && !c4) continue;

    if (fridayMarker.test(c0)) {
      mode = "friday";
      current = null;
      continue;
    }

    if (headerRegex.test(c0) || /route\s*details/i.test(c3)) {
      current = null;
      continue;
    }

    const looksLikeRouteCode = /^[RF]\d+/i.test(c0);
    if (looksLikeRouteCode) {
      current = {
        code: c0,
        name: c2 || "",
        details: c3 || "",
        toDSC: [],
        fromDSC: [],
      };
      if (c1) current.toDSC.push(normalizeTime(c1));
      if (c4) current.fromDSC.push(normalizeTime(c4));
      (mode === "friday" ? routesFriday : routesRegular).push(current);
      continue;
    }

    if (current && !c0) {
      if (c1) current.toDSC.push(normalizeTime(c1));
      if (c4) current.fromDSC.push(normalizeTime(c4));
    }
  }

  for (const r of [...routesRegular, ...routesFriday]) {
    r.display = `${r.code}${r.name ? " — " + r.name : ""}`.trim();
    r.toDSC = Array.from(new Set(r.toDSC));
    r.fromDSC = Array.from(new Set(r.fromDSC));
  }

  return { regular: routesRegular, friday: routesFriday };
}

function normalizeTime(t) {
  if (t == null || t === "") return "";

  if (typeof t === "number" && !isNaN(t)) {
    if (t >= 0 && t < 1) {
      const totalMinutes = Math.round(t * 24 * 60);
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      return formatTime(hh, mm);
    }
    if (t > 1 && t < 24) {
      const hh = Math.floor(t);
      const mm = Math.round((t - hh) * 60);
      return formatTime(hh, mm);
    }
  }

  t = t.toString().replace(/\s+/g, " ").trim();

  if (/to/i.test(t)) return t; // "5:30 to 6:00 PM"
  t = t.replace(/^(\d{1,2})\.(\d{2})\s*(AM|PM)$/i, "$1:$2 $3");

  if (/^\d{1,2}:\d{2}(\s?(AM|PM))?$/i.test(t)) {
    return t.toUpperCase();
  }

  return t;
}

function formatTime(hh, mm) {
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

function populateRouteDropdown() {
  const fridayOnly = els.toggleFriday.checked;
  const list = fridayOnly ? state.friday : state.regular;
  const options = ['<option value="">All routes</option>'].concat(
    list.map(
      (r) =>
        `<option value="${escapeHtml(r.code)}">${escapeHtml(
          r.display
        )}</option>`
    )
  );
  els.selectRoute.innerHTML = options.join("");
}

function updateFooter() {
  els.excelHeading.textContent = state.meta.heading || "";
  els.lastUpdate.textContent = `Last Update: ${state.meta.lastUpdate || "N/A"}`;
}

function render() {
  const fridayOnly = els.toggleFriday.checked;
  const list = fridayOnly ? state.friday : state.regular;
  const q = (els.inputSearch.value || "").toLowerCase();
  const selectedCode = els.selectRoute.value;

  let filtered = list;
  if (selectedCode) {
    filtered = filtered.filter((r) => r.code === selectedCode);
  }
  if (q) {
    filtered = filtered.filter((r) => {
      const hay = [
        r.code,
        r.name,
        r.details,
        ...(r.toDSC || []),
        ...(r.fromDSC || []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (filtered.length === 0) {
    els.results.innerHTML = `<div class="card"><p>No matching routes found.</p></div>`;
    return;
  }

  els.results.innerHTML = filtered.map(routeCard).join("");
}

function routeCard(r) {
  const toChips = (r.toDSC || [])
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join("");
  const fromChips = (r.fromDSC || [])
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join("");
  const details = r.details || "—";
  return `<article class="card">
    <h3>${escapeHtml(r.display)}</h3>
    <div class="meta">
      <span class="badge">${escapeHtml(
        r.code.startsWith("F") ? "Friday" : "Regular"
      )}</span>
    </div>
    <div class="detail">${escapeHtml(details)}</div>
    <div class="times">
      <div class="time-col">
        <h4>Start Time (to DSC)</h4>
        <div class="time-chips">${toChips || "—"}</div>
      </div>
      <div class="time-col">
        <h4>Departure (from DSC)</h4>
        <div class="time-chips">${fromChips || "—"}</div>
      </div>
    </div>
  </article>`;
}

function escapeHtml(str) {
  return (str || "").toString().replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[s])
  );
}
