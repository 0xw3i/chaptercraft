/* UX Polish Version — client-side only (NO TM suggestions)
   - Calm header + Tools menu
   - Simplified nav (Prev/Next based on filter)
   - Dialogue symbols expanded + hyphen dialogue lines
   - Glossary + inline chips
   - Segment Mode as modal (not inside cards)
   - Focus Mode (one paragraph at a time)
   - Auto backups + restore + project import/export
   - Resume to lastFocusedIndex
*/

const STORAGE_KEY = "wn_translator_ux_v2_no_suggest";
const PAGE_SIZE = 40;
const MAX_BACKUPS = 12;
const AUTO_BACKUP_MS = 2 * 60 * 1000; // 2 minutes
const backToTopBtn = document.getElementById("backToTop");
// Elements
const paragraphsDiv = document.getElementById("paragraphs");
const rawTextEl = document.getElementById("rawText");
const projectNameEl = document.getElementById("projectName");
const searchBoxEl = document.getElementById("searchBox");
const filterModeEl = document.getElementById("filterMode");

const progressTextTopEl = document.getElementById("progressTextTop");
const progressFillTopEl = document.getElementById("progressFillTop");
const themeToggleEl = document.getElementById("themeToggle");

const btnSplit = document.getElementById("btnSplit");
const btnClearAll = document.getElementById("btnClearAll");
const fileInput = document.getElementById("fileInput");

const toggleDialogueToolsEl = document.getElementById("toggleDialogueTools");
const toggleAutoAdvanceEl = document.getElementById("toggleAutoAdvance");
const toggleAutoBackupEl = document.getElementById("toggleAutoBackup");
const toggleChipInsertsOriginalEl = document.getElementById("toggleChipInsertsOriginal");

const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnFocus = document.getElementById("btnFocus");

const btnExportTxt = document.getElementById("btnExportTxt");
const btnExportReview = document.getElementById("btnExportReview");

const btnTools = document.getElementById("btnTools");
const toolsMenu = document.getElementById("toolsMenu");

const btnGlossary = document.getElementById("btnGlossary");
const btnBackups = document.getElementById("btnBackups");
const btnCheck = document.getElementById("btnCheck");
const btnExportProject = document.getElementById("btnExportProject");
const btnImportProject = document.getElementById("btnImportProject");
const hiddenProjectImport = document.getElementById("hiddenProjectImport");

const drawerGlossary = document.getElementById("drawerGlossary");
const btnCloseGlossary = document.getElementById("btnCloseGlossary");
const glossKeyEl = document.getElementById("glossKey");
const glossValEl = document.getElementById("glossVal");
const btnAddGloss = document.getElementById("btnAddGloss");
const glossSearchEl = document.getElementById("glossSearch");
const glossListEl = document.getElementById("glossList");
const btnExportGlossary = document.getElementById("btnExportGlossary");
const btnImportGlossary = document.getElementById("btnImportGlossary");
const hiddenGlossaryImport = document.getElementById("hiddenGlossaryImport");
const btnClearGlossary = document.getElementById("btnClearGlossary");

const drawerBackups = document.getElementById("drawerBackups");
const btnCloseBackups = document.getElementById("btnCloseBackups");
const backupListEl = document.getElementById("backupList");
const btnMakeBackup = document.getElementById("btnMakeBackup");
const btnDownloadProjectJson = document.getElementById("btnDownloadProjectJson");

const drawerCheck = document.getElementById("drawerCheck");
const btnCloseCheck = document.getElementById("btnCloseCheck");
const checkReportEl = document.getElementById("checkReport");

const drawerSegment = document.getElementById("drawerSegment");
const btnCloseSegment = document.getElementById("btnCloseSegment");
const segmentBody = document.getElementById("segmentBody");

// State
let visibleCount = PAGE_SIZE;
let lastFocusedIndex = 0;
let focusMode = false;

// Model (TM removed)
let model = {
  theme: "dark",
  projectName: "",
  rawText: "",
  ui: {
    dialogueTools: true,
    autoAdvance: true,
    autoBackup: true,
    chipInsertsOriginal: false
  },
  glossary: {},
  backups: [],
  paragraphs: []
};

// ---------- Utils ----------
function nowTs(){ return Date.now(); }
function safeParseJSON(text){ try { return JSON.parse(text); } catch { return null; } }

function normalizeFilename(name){
  return (name || "translated")
    .trim()
    .replaceAll(/[\\/:*?"<>|]/g, "-")
    .slice(0, 120) || "translated";
}

function downloadText(text, filename){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function escapeHtml(str){
  return (str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function uniq(arr){ return [...new Set(arr)]; }

function wordCount(text){
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function insertAtCursor(textarea, text){
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
}

// ---------- Theme ----------
function applyTheme(theme){
  model.theme = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", model.theme);
  themeToggleEl.textContent = model.theme === "light" ? "☀️" : "🌙";
}

// ---------- Dialogue detection (expanded) ----------
const QUOTE_PAIRS = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
  ['‘', '’'],
  ['`', '`'],
  ['«', '»'],
  ['「', '」'],
  ['『', '』']
];

function extractByPairs(text){
  const results = [];
  for (const [L, R] of QUOTE_PAIRS){
    let start = 0;
    while (true){
      const i = text.indexOf(L, start);
      if (i === -1) break;
      const j = text.indexOf(R, i + L.length);
      if (j === -1) break;
      const inside = text.slice(i + L.length, j).trim();
      if (inside) results.push(inside);
      start = j + R.length;
    }
  }
  return results;
}

function extractHyphenDialogues(text){
  const lines = (text || "").split(/\r?\n/);
  const out = [];
  for (const ln of lines){
    const m = ln.match(/^\s*([-—–])\s+(.+?)\s*$/);
    if (m && m[2]) out.push(m[2].trim());
  }
  return out;
}

function extractDialogues(text){
  const fromQuotes = extractByPairs(text || "");
  const fromHyphens = extractHyphenDialogues(text || "");
  return uniq([...fromQuotes, ...fromHyphens]).filter(Boolean);
}

function hasDialogue(text){
  return extractDialogues(text).length > 0;
}

function highlightDialogues(text){
  let safe = escapeHtml(text || "");

  for (const [L, R] of QUOTE_PAIRS){
    const l = escapeRegExp(escapeHtml(L));
    const r = escapeRegExp(escapeHtml(R));
    const re = new RegExp(`${l}([\\s\\S]*?)${r}`, "g");
    safe = safe.replace(re, (m, p1) => {
      return `${escapeHtml(L)}<span class="dialogue">${escapeHtml(p1)}</span>${escapeHtml(R)}`;
    });
  }

  safe = safe.replace(/^(\s*[-—–]\s+)(.+)$/gm, (m, prefix, rest) => {
    return `${escapeHtml(prefix)}<span class="dialogue">${escapeHtml(rest)}</span>`;
  });

  return safe;
}

// ---------- Glossary ----------
function glossEntries(){
  const q = (glossSearchEl.value || "").trim().toLowerCase();
  const items = Object.entries(model.glossary || {})
    .map(([k,v]) => ({k, v}))
    .sort((a,b) => a.k.localeCompare(b.k));
  if (!q) return items;
  return items.filter(it =>
    it.k.toLowerCase().includes(q) || it.v.toLowerCase().includes(q)
  );
}

function renderGlossary(){
  glossListEl.innerHTML = "";
  const items = glossEntries();
  if (!items.length){
    glossListEl.innerHTML = `<div class="item"><div class="kv"><div class="k">No glossary entries</div><div class="v">Add names, skills, places, items.</div></div></div>`;
    return;
  }

  for (const it of items){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="kv">
        <div class="k">${escapeHtml(it.k)}</div>
        <div class="v">${escapeHtml(it.v)}</div>
      </div>
      <div class="actions">
        <button class="btn" data-act="copyVal">Copy</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>
    `;
    row.querySelector('[data-act="copyVal"]').onclick = () => copyToClipboard(it.v);
    row.querySelector('[data-act="del"]').onclick = () => {
      delete model.glossary[it.k];
      saveState();
      renderGlossary();
    };
    glossListEl.appendChild(row);
  }
}

async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); }catch{}
}

function glossaryMatchesForOriginal(original){
  const o = original || "";
  const keys = Object.keys(model.glossary || {});
  if (!keys.length) return [];
  const matches = [];
  for (const k of keys){
    if (k && o.includes(k)) matches.push({k, v: model.glossary[k]});
  }
  matches.sort((a,b) => b.k.length - a.k.length);
  return matches.slice(0, 10);
}

// ---------- Backups ----------
function makeSnapshot(){
  const snap = {
    theme: model.theme,
    projectName: projectNameEl.value || model.projectName,
    ui: {
      dialogueTools: !!toggleDialogueToolsEl.checked,
      autoAdvance: !!toggleAutoAdvanceEl.checked,
      autoBackup: !!toggleAutoBackupEl.checked,
      chipInsertsOriginal: !!toggleChipInsertsOriginalEl.checked
    },
    glossary: model.glossary || {},
    rawText: rawTextEl.value || model.rawText,
    paragraphs: model.paragraphs || [],
    lastFocusedIndex: lastFocusedIndex
  };

  const ts = nowTs();
  const name = normalizeFilename(projectNameEl.value || "project");
  const size = JSON.stringify(snap).length;

  model.backups = model.backups || [];
  model.backups.unshift({ ts, name, size, snapshot: snap });
  if (model.backups.length > MAX_BACKUPS) model.backups.length = MAX_BACKUPS;

  saveState();
  renderBackups();
}

function renderBackups(){
  backupListEl.innerHTML = "";
  const list = model.backups || [];
  if (!list.length){
    backupListEl.innerHTML = `<div class="item"><div class="kv"><div class="k">No backups yet</div><div class="v">Enable auto-backup or create a snapshot.</div></div></div>`;
    return;
  }

  for (const b of list){
    const d = new Date(b.ts);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="kv">
        <div class="k">${escapeHtml(b.name)} — ${d.toLocaleString()}</div>
        <div class="v">Size: ${Math.round(b.size/1024)} KB</div>
      </div>
      <div class="actions">
        <button class="btn" data-act="restore">Restore</button>
        <button class="btn" data-act="download">Download</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>
    `;
    row.querySelector('[data-act="restore"]').onclick = () => {
      if (!confirm("Restore this snapshot? Current progress will be replaced.")) return;
      loadSnapshot(b.snapshot);
      closeDrawer(drawerBackups);
    };
    row.querySelector('[data-act="download"]').onclick = () => {
      downloadJSON(b.snapshot, `${normalizeFilename(b.name)}-snapshot-${b.ts}.json`);
    };
    row.querySelector('[data-act="del"]').onclick = () => {
      model.backups = model.backups.filter(x => x.ts !== b.ts);
      saveState();
      renderBackups();
    };
    backupListEl.appendChild(row);
  }
}

function updateBackToTopVisibility(){
  const show = window.scrollY > 600;
  backToTopBtn.setAttribute("aria-hidden", show ? "false" : "true");
}

window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });

backToTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// initial state on load
updateBackToTopVisibility();

function loadSnapshot(snap){
  model.theme = snap.theme || "dark";
  model.projectName = snap.projectName || "";
  model.ui = snap.ui || model.ui;
  model.glossary = snap.glossary || {};
  model.rawText = snap.rawText || "";
  model.paragraphs = Array.isArray(snap.paragraphs) ? snap.paragraphs : [];

  lastFocusedIndex = Number.isInteger(snap.lastFocusedIndex) ? snap.lastFocusedIndex : 0;

  applyTheme(model.theme);
  projectNameEl.value = model.projectName || "";
  rawTextEl.value = model.rawText || "";

  toggleDialogueToolsEl.checked = !!(model.ui?.dialogueTools ?? true);
  toggleAutoAdvanceEl.checked = !!(model.ui?.autoAdvance ?? true);
  toggleAutoBackupEl.checked = !!(model.ui?.autoBackup ?? true);
  toggleChipInsertsOriginalEl.checked = !!(model.ui?.chipInsertsOriginal ?? false);

  visibleCount = PAGE_SIZE;
  saveState();
  renderGlossary();
  renderBackups();
  renderParagraphs();
  updateProgress();

  setTimeout(() => focusParagraph(lastFocusedIndex), 50);
}

// ---------- Persistence ----------
function saveState(){
  model.projectName = projectNameEl.value || "";
  model.rawText = rawTextEl.value || "";
  model.ui.dialogueTools = !!toggleDialogueToolsEl.checked;
  model.ui.autoAdvance = !!toggleAutoAdvanceEl.checked;
  model.ui.autoBackup = !!toggleAutoBackupEl.checked;
  model.ui.chipInsertsOriginal = !!toggleChipInsertsOriginalEl.checked;

  const payload = {
    ...model,
    lastFocusedIndex
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState(){
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data){
    applyTheme("dark");
    return;
  }
  const parsed = safeParseJSON(data);
  if (!parsed){
    applyTheme("dark");
    return;
  }

  // Backward compatibility: ignore old fields like "tm"
  model = { ...model, ...parsed };
  lastFocusedIndex = Number.isInteger(parsed.lastFocusedIndex) ? parsed.lastFocusedIndex : 0;

  applyTheme(model.theme || "dark");
  projectNameEl.value = model.projectName || "";
  rawTextEl.value = model.rawText || "";

  toggleDialogueToolsEl.checked = !!(model.ui?.dialogueTools ?? true);
  toggleAutoAdvanceEl.checked = !!(model.ui?.autoAdvance ?? true);
  toggleAutoBackupEl.checked = !!(model.ui?.autoBackup ?? true);
  toggleChipInsertsOriginalEl.checked = !!(model.ui?.chipInsertsOriginal ?? false);

  if (!Array.isArray(model.paragraphs)) model.paragraphs = [];
  if (!Array.isArray(model.backups)) model.backups = [];
  if (!model.glossary || typeof model.glossary !== "object") model.glossary = {};

  renderGlossary();
  renderBackups();
  renderParagraphs();
  updateProgress();

  setTimeout(() => focusParagraph(lastFocusedIndex), 50);
}

// ---------- Progress ----------
function statusOf(p){
  if (p.skipped) return "skipped";
  if (p.done || ((p.translation || "").trim().length > 0)) return "done";
  return "untranslated";
}

function updateProgress(){
  const total = model.paragraphs.length;
  const translated = model.paragraphs.filter(p => {
    const t = (p.translation || "").trim();
    return p.skipped ? false : (p.done || t.length > 0);
  }).length;
  const pct = total ? Math.round((translated / total) * 100) : 0;

  progressTextTopEl.textContent = `${translated} / ${total} (${pct}%)`;
  progressFillTopEl.style.width = `${pct}%`;
}

// ---------- Filter/search + navigation ----------
function matchesSearch(p, q){
  if (!q) return true;
  const hay = ((p.original || "") + "\n" + (p.translation || "")).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesFilter(p, filter){
  if (filter === "all") return true;
  if (filter === "dialogue") return hasDialogue(p.original || "");
  return statusOf(p) === filter;
}

function matchingIndexes(){
  const q = (searchBoxEl.value || "").trim();
  const f = filterModeEl.value || "untranslated";
  const out = [];
  for (let i = 0; i < model.paragraphs.length; i++){
    const p = model.paragraphs[i];
    if (!matchesSearch(p, q)) continue;
    if (!matchesFilter(p, f)) continue;
    out.push(i);
  }
  return out;
}

function predicateForCurrentMode(){
  const f = filterModeEl.value || "untranslated";
  if (f === "untranslated") return (p) => statusOf(p) === "untranslated";
  if (f === "done") return (p) => statusOf(p) === "done";
  if (f === "skipped") return (p) => statusOf(p) === "skipped";
  if (f === "dialogue") return (p) => hasDialogue(p.original || "");
  return () => true; // all
}

function nextIndexFrom(current, direction=+1){
  const idxs = matchingIndexes();
  if (!idxs.length) return -1;

  const pred = predicateForCurrentMode();

  const pos = idxs.indexOf(current);
  let start = (pos === -1) ? (direction > 0 ? 0 : idxs.length - 1) : (pos + direction);

  for (let k = start; k >= 0 && k < idxs.length; k += direction){
    const i = idxs[k];
    const p = model.paragraphs[i];
    if (pred(p)) return i;
  }
  return -1;
}

function focusParagraph(index){
  const el = document.querySelector(`[data-idx="${index}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const ta = el.querySelector("textarea.main-translation");
  if (ta) ta.focus();
}

// ---------- Segment modal ----------
function splitSegments(text){
  const t = (text || "").trim();
  if (!t) return [];
  const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = t.split(/(?<=[.!?。！？…])\s+/).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

function segmentsToParagraph(segT){
  return (segT || []).map(x => (x || "").trim()).join("\n").trim();
}

let segmentIndexOpen = null;

function openSegmentModal(idx){
  segmentIndexOpen = idx;
  const p = model.paragraphs[idx];
  if (!p) return;

  const segO = Array.isArray(p.segO) && p.segO.length ? p.segO : splitSegments(p.original || "");
  let segT = Array.isArray(p.segT) && p.segT.length ? p.segT : [];

  if (!segT.length){
    const existing = (p.translation || "").split(/\r?\n/).map(x => x.trim());
    segT = segO.map((_, i) => existing[i] || "");
  }

  p.segO = segO;
  p.segT = segT;

  segmentBody.innerHTML = `
    <div class="seg-wrap">
      <div class="seg-top">
        <div class="seg-meta">Paragraph ${idx + 1} • Segments: ${segO.length}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnSegMerge">Merge & Close</button>
          <button class="btn danger" id="btnSegCancel">Cancel</button>
        </div>
      </div>
      <div class="seg-list" id="segList"></div>
    </div>
  `;

  const list = document.getElementById("segList");
  segO.forEach((oSeg, i) => {
    const row = document.createElement("div");
    row.className = "seg-row";
    row.innerHTML = `
      <div class="o">${toggleDialogueToolsEl.checked ? highlightDialogues(oSeg) : escapeHtml(oSeg)}</div>
      <textarea placeholder="Translate segment ${i+1}..."></textarea>
    `;
    const ta = row.querySelector("textarea");
    ta.value = p.segT[i] || "";
    ta.addEventListener("input", () => {
      p.segT[i] = ta.value;
      saveState();
    });
    list.appendChild(row);
  });

  document.getElementById("btnSegMerge").onclick = () => {
    p.translation = segmentsToParagraph(p.segT);
    p.skipped = false;
    saveState();
    updateProgress();
    closeDrawer(drawerSegment);
    renderParagraphs();
    focusParagraph(idx);
  };

  document.getElementById("btnSegCancel").onclick = () => {
    closeDrawer(drawerSegment);
  };

  openDrawer(drawerSegment);
}

// ---------- Rendering ----------
function renderParagraphs(){
  paragraphsDiv.innerHTML = "";

  const idxs = matchingIndexes();
  const slice = idxs.slice(0, visibleCount);

  if (focusMode){
    const inFilter = idxs.includes(lastFocusedIndex) ? lastFocusedIndex : (idxs[0] ?? -1);
    paragraphsDiv.innerHTML = "";
    if (inFilter !== -1){
      paragraphsDiv.appendChild(renderCard(inFilter));
    } else {
      paragraphsDiv.innerHTML = `<div class="card"><div class="card-head"><div class="badge">No paragraphs match filter/search</div><div class="badge"></div></div></div>`;
    }
    return;
  }

  for (const idx of slice){
    paragraphsDiv.appendChild(renderCard(idx));
  }

  if (idxs.length > visibleCount){
    const more = document.createElement("button");
    more.className = "btn";
    more.textContent = `Load more (${Math.min(PAGE_SIZE, idxs.length - visibleCount)})`;
    more.onclick = () => {
      visibleCount += PAGE_SIZE;
      renderParagraphs();
      saveState();
    };
    paragraphsDiv.appendChild(more);
  }
}

function renderCard(idx){
  const p = model.paragraphs[idx];
  const st = statusOf(p);
  const stText = (st === "done") ? "✅ done" : (st === "skipped") ? "⏭ skipped" : "… untranslated";
  const stGood = (st === "done");

  const dialogues = toggleDialogueToolsEl.checked ? extractDialogues(p.original || "") : [];
  const hasDlg = dialogues.length > 0;

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.idx = idx;

  card.innerHTML = `
    <div class="card-head">
      <div class="badge">Paragraph ${idx + 1}</div>
      <div class="badge ${stGood ? "good" : ""}">${stText}</div>
    </div>

    <div class="card-body">
      <div class="pane original"></div>
      <div class="pane translation">
        <div class="translation">
          <textarea class="main-translation" placeholder="Translate here..."></textarea>
        </div>

        <div class="card-actions">
          <button class="btn" data-act="segment">Segment</button>
          <span class="sep">•</span>
          <button class="btn" data-act="done">Done</button>
          <button class="btn" data-act="skip">Skip</button>
          <button class="btn danger" data-act="clear">Clear</button>
          <span class="small" style="margin-left:auto">
            Words: ${wordCount(p.translation || "")} / ${wordCount(p.original || "")}
          </span>
        </div>
      </div>
    </div>
  `;

  const origPane = card.querySelector(".pane.original");
  origPane.innerHTML = toggleDialogueToolsEl.checked ? highlightDialogues(p.original || "") : escapeHtml(p.original || "");

  if (toggleDialogueToolsEl.checked && hasDlg){
    const chips = document.createElement("div");
    chips.className = "chips";

    for (const d of dialogues.slice(0, 12)){
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `Dialogue`;
      chip.title = toggleChipInsertsOriginalEl.checked
        ? "Insert original dialogue"
        : "Insert empty quotes and focus cursor";

      chip.onclick = () => {
        const ta = card.querySelector("textarea.main-translation");
        if (toggleChipInsertsOriginalEl.checked){
          insertAtCursor(ta, `“${d}”\n`);
        } else {
          const before = ta.value.substring(0, ta.selectionStart ?? ta.value.length);
          const after = ta.value.substring(ta.selectionEnd ?? ta.value.length);
          const insert = `“”`;
          const pos = before.length + 1; // inside quotes
          ta.value = before + insert + after;
          ta.selectionStart = ta.selectionEnd = pos;
        }
        p.translation = ta.value;
        p.skipped = false;
        saveState();
        updateProgress();
        ta.focus();
        refreshMeta(card, p);
      };
      chips.appendChild(chip);
    }

    origPane.appendChild(chips);
  }

  const ta = card.querySelector("textarea.main-translation");
  ta.value = p.translation || "";

  ta.addEventListener("focus", () => {
    lastFocusedIndex = idx;
    saveState();
  });

  ta.addEventListener("input", () => {
    p.translation = ta.value;
    if ((p.translation || "").trim().length > 0) p.skipped = false;
    saveState();
    updateProgress();
    refreshMeta(card, p);
  });

  // Inline glossary chips (kept)
  renderGlossaryInlineChips(card, p);

  // Actions
  card.querySelector('[data-act="done"]').onclick = () => {
    p.done = true;
    p.skipped = false;
    saveState();
    updateProgress();
    renderParagraphs();
    autoAdvanceIfEnabled(idx);
  };

  card.querySelector('[data-act="skip"]').onclick = () => {
    p.skipped = true;
    p.done = false;
    saveState();
    updateProgress();
    renderParagraphs();
    autoAdvanceIfEnabled(idx);
  };

  card.querySelector('[data-act="clear"]').onclick = () => {
    if (!confirm("Clear translation for this paragraph?")) return;
    p.translation = "";
    p.done = false;
    p.skipped = false;
    p.segO = [];
    p.segT = [];
    saveState();
    updateProgress();
    renderParagraphs();
    focusParagraph(idx);
  };

  card.querySelector('[data-act="segment"]').onclick = () => openSegmentModal(idx);

  return card;
}

function refreshMeta(card, p){
  const badge = card.querySelectorAll(".badge")[1];
  const st = statusOf(p);
  const stText = (st === "done") ? "✅ done" : (st === "skipped") ? "⏭ skipped" : "… untranslated";
  badge.textContent = stText;
  badge.className = `badge ${st === "done" ? "good" : ""}`;

  const small = card.querySelector(".small");
  if (small) small.textContent = `Words: ${wordCount(p.translation || "")} / ${wordCount(p.original || "")}`;
}

function renderGlossaryInlineChips(card, p){
  const matches = glossaryMatchesForOriginal(p.original || "");
  if (!matches.length) return;

  const row = document.createElement("div");
  row.className = "chips";
  row.style.marginTop = "10px";

  const ta = card.querySelector("textarea.main-translation");
  for (const m of matches){
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = `${m.k} → ${m.v}`;
    chip.title = "Insert glossary translation";
    chip.onclick = () => {
      insertAtCursor(ta, m.v);
      p.translation = ta.value;
      p.skipped = false;
      saveState();
      updateProgress();
      ta.focus();
      refreshMeta(card, p);
    };
    row.appendChild(chip);
  }

  card.querySelector(".pane.translation").appendChild(row);
}

function autoAdvanceIfEnabled(idx){
  if (!toggleAutoAdvanceEl.checked) return;
  const nxt = nextIndexFrom(idx, +1);
  if (nxt !== -1){
    lastFocusedIndex = nxt;
    saveState();
    if (focusMode) renderParagraphs();
    focusParagraph(nxt);
  }
}

// ---------- Export ----------
function exportTranslationOnly(){
  return model.paragraphs
    .filter(p => !p.skipped)
    .map(p => (p.translation || "").trim())
    .join("\n\n")
    .trim();
}

function exportReviewFormat(){
  return model.paragraphs
    .filter(p => !p.skipped)
    .map(p => {
      const o = (p.original || "").trim();
      const t = (p.translation || "").trim();
      return `--- ORIGINAL ---\n${o}\n\n--- TRANSLATION ---\n${t}\n`;
    })
    .join("\n\n")
    .trim();
}

function exportProject(){
  return {
    version: "ux_v2_no_suggest",
    exportedAt: new Date().toISOString(),
    snapshot: {
      theme: model.theme,
      projectName: projectNameEl.value || "",
      ui: {
        dialogueTools: !!toggleDialogueToolsEl.checked,
        autoAdvance: !!toggleAutoAdvanceEl.checked,
        autoBackup: !!toggleAutoBackupEl.checked,
        chipInsertsOriginal: !!toggleChipInsertsOriginalEl.checked
      },
      glossary: model.glossary || {},
      rawText: rawTextEl.value || "",
      paragraphs: model.paragraphs || [],
      lastFocusedIndex
    }
  };
}

// ---------- Consistency Check ----------
function buildCheckReport(){
  const items = [];

  const total = model.paragraphs.length;
  const untranslated = model.paragraphs.filter(p => statusOf(p) === "untranslated").length;
  const skipped = model.paragraphs.filter(p => p.skipped).length;

  items.push({ title: "Overview", body: `Total: ${total}\nUntranslated: ${untranslated}\nSkipped: ${skipped}` });

  const doneEmpty = [];
  model.paragraphs.forEach((p, i) => {
    if (p.done && ((p.translation || "").trim().length === 0)) doneEmpty.push(i+1);
  });
  if (doneEmpty.length){
    items.push({ title: "Done but empty translation", body: `Paragraphs: ${doneEmpty.slice(0,60).join(", ")}${doneEmpty.length>60?"…":""}` });
  }

  const gloss = model.glossary || {};
  const glossKeys = Object.keys(gloss);
  if (glossKeys.length){
    const misses = [];
    for (let i=0; i<model.paragraphs.length; i++){
      const p = model.paragraphs[i];
      if (p.skipped) continue;
      const o = p.original || "";
      const t = p.translation || "";
      for (const k of glossKeys){
        if (k && o.includes(k)){
          const v = gloss[k] || "";
          if (v && !t.includes(v)){
            misses.push({ i: i+1, k, v });
            break;
          }
        }
      }
    }
    if (misses.length){
      items.push({
        title: "Glossary possibly not applied",
        body: misses.slice(0,50).map(m => `P${m.i}: ${m.k} → ${m.v}`).join("\n") + (misses.length>50 ? "\n…" : "")
      });
    }
  }

  const dlgUn = [];
  model.paragraphs.forEach((p, i) => {
    if (statusOf(p) === "untranslated" && hasDialogue(p.original || "")) dlgUn.push(i+1);
  });
  if (dlgUn.length){
    items.push({
      title: "Untranslated dialogue paragraphs",
      body: `Paragraphs: ${dlgUn.slice(0,80).join(", ")}${dlgUn.length>80?"…":""}`
    });
  }

  return items;
}

function showCheck(){
  checkReportEl.innerHTML = "";
  const report = buildCheckReport();
  for (const r of report){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="kv">
        <div class="k">${escapeHtml(r.title)}</div>
        <div class="v">${escapeHtml(r.body)}</div>
      </div>
      <div class="actions"></div>
    `;
    checkReportEl.appendChild(row);
  }
}

// ---------- Drawers/Menu ----------
function openDrawer(el){ el.setAttribute("aria-hidden","false"); }
function closeDrawer(el){ el.setAttribute("aria-hidden","true"); }
function drawerClickOutsideToClose(drawer){
  drawer.addEventListener("click", (e) => {
    if (e.target === drawer) closeDrawer(drawer);
  });
}

function openToolsMenu(){
  toolsMenu.setAttribute("aria-hidden","false");
  btnTools.setAttribute("aria-expanded","true");
}
function closeToolsMenu(){
  toolsMenu.setAttribute("aria-hidden","true");
  btnTools.setAttribute("aria-expanded","false");
}
function toggleToolsMenu(){
  const open = toolsMenu.getAttribute("aria-hidden") === "false";
  if (open) closeToolsMenu(); else openToolsMenu();
}

// Close menu on outside click
document.addEventListener("click", (e) => {
  if (!btnTools.contains(e.target) && !toolsMenu.contains(e.target)) closeToolsMenu();
});

// ---------- Events ----------
themeToggleEl.onclick = () => {
  const next = (model.theme === "light") ? "dark" : "light";
  applyTheme(next);
  saveState();
};

btnTools.onclick = (e) => { e.stopPropagation(); toggleToolsMenu(); };

btnGlossary.onclick = () => { closeToolsMenu(); openDrawer(drawerGlossary); renderGlossary(); glossKeyEl.focus(); };
btnBackups.onclick = () => { closeToolsMenu(); openDrawer(drawerBackups); renderBackups(); };
btnCheck.onclick = () => { closeToolsMenu(); openDrawer(drawerCheck); showCheck(); };
btnExportProject.onclick = () => {
  closeToolsMenu();
  const pack = exportProject();
  downloadJSON(pack, `${normalizeFilename(projectNameEl.value || "project")}.project.json`);
};
btnImportProject.onclick = () => { closeToolsMenu(); hiddenProjectImport.click(); };

btnCloseGlossary.onclick = () => closeDrawer(drawerGlossary);
btnCloseBackups.onclick = () => closeDrawer(drawerBackups);
btnCloseCheck.onclick = () => closeDrawer(drawerCheck);
btnCloseSegment.onclick = () => closeDrawer(drawerSegment);

drawerClickOutsideToClose(drawerGlossary);
drawerClickOutsideToClose(drawerBackups);
drawerClickOutsideToClose(drawerCheck);
drawerClickOutsideToClose(drawerSegment);

fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { rawTextEl.value = reader.result; saveState(); };
  reader.readAsText(file);
});

btnSplit.onclick = () => {
  const text = (rawTextEl.value || "").trim();
  if (!text) return alert("No text provided.");

  const parts = text.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);

  model.paragraphs = parts.map(p => ({
    original: p,
    translation: "",
    done: false,
    skipped: false,
    segO: [],
    segT: []
  }));

  visibleCount = PAGE_SIZE;
  lastFocusedIndex = 0;
  focusMode = false;

  saveState();
  renderParagraphs();
  updateProgress();
  makeSnapshot();
  setTimeout(() => focusParagraph(0), 50);
};

btnClearAll.onclick = () => {
  if (!confirm("Clear everything? This removes local progress.")) return;
  const keepTheme = model.theme;

  model = {
    theme: keepTheme,
    projectName: "",
    rawText: "",
    ui: { dialogueTools: true, autoAdvance: true, autoBackup: true, chipInsertsOriginal: false },
    glossary: {},
    backups: [],
    paragraphs: []
  };

  rawTextEl.value = "";
  projectNameEl.value = "";
  searchBoxEl.value = "";
  filterModeEl.value = "untranslated";

  visibleCount = PAGE_SIZE;
  lastFocusedIndex = 0;
  focusMode = false;

  saveState();
  renderGlossary();
  renderBackups();
  renderParagraphs();
  updateProgress();
};

projectNameEl.addEventListener("input", saveState);
rawTextEl.addEventListener("input", saveState);

toggleDialogueToolsEl.addEventListener("change", () => { visibleCount = PAGE_SIZE; saveState(); renderParagraphs(); });
toggleAutoAdvanceEl.addEventListener("change", saveState);
toggleAutoBackupEl.addEventListener("change", saveState);
toggleChipInsertsOriginalEl.addEventListener("change", saveState);

searchBoxEl.addEventListener("input", () => { visibleCount = PAGE_SIZE; renderParagraphs(); saveState(); });
filterModeEl.addEventListener("change", () => { visibleCount = PAGE_SIZE; renderParagraphs(); saveState(); });

btnPrev.onclick = () => {
  const prv = nextIndexFrom(lastFocusedIndex, -1);
  if (prv === -1) return alert("No previous match (filter/search).");
  lastFocusedIndex = prv;
  saveState();
  if (focusMode) renderParagraphs();
  focusParagraph(prv);
};

btnNext.onclick = () => {
  const nxt = nextIndexFrom(lastFocusedIndex, +1);
  if (nxt === -1) return alert("No next match (filter/search).");
  lastFocusedIndex = nxt;
  saveState();
  if (focusMode) renderParagraphs();
  focusParagraph(nxt);
};

btnFocus.onclick = () => {
  focusMode = !focusMode;
  btnFocus.textContent = focusMode ? "Focus: ON" : "Focus";
  renderParagraphs();
  setTimeout(() => focusParagraph(lastFocusedIndex), 50);
};

btnExportTxt.onclick = () => {
  const out = exportTranslationOnly();
  downloadText(out, `${normalizeFilename(projectNameEl.value || "translated")}.txt`);
};

btnExportReview.onclick = () => {
  const out = exportReviewFormat();
  downloadText(out, `${normalizeFilename(projectNameEl.value || "translated")}-review.txt`);
};

// Project import
hiddenProjectImport.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pack = safeParseJSON(reader.result);
    if (!pack?.snapshot) return alert("Invalid project file.");
    loadSnapshot(pack.snapshot);
    makeSnapshot();
  };
  reader.readAsText(file);
});

// Glossary actions
btnAddGloss.onclick = () => {
  const k = (glossKeyEl.value || "").trim();
  const v = (glossValEl.value || "").trim();
  if (!k || !v) return alert("Enter both key and value.");
  model.glossary[k] = v;
  glossKeyEl.value = "";
  glossValEl.value = "";
  saveState();
  renderGlossary();
  renderParagraphs();
};

glossSearchEl.addEventListener("input", renderGlossary);

btnExportGlossary.onclick = () => {
  downloadJSON({ glossary: model.glossary || {}, exportedAt: new Date().toISOString() },
    `${normalizeFilename(projectNameEl.value || "glossary")}.glossary.json`);
};

btnImportGlossary.onclick = () => hiddenGlossaryImport.click();
hiddenGlossaryImport.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pack = safeParseJSON(reader.result);
    const g = pack?.glossary;
    if (!g || typeof g !== "object") return alert("Invalid glossary file.");
    model.glossary = { ...(model.glossary || {}), ...g };
    saveState();
    renderGlossary();
    renderParagraphs();
  };
  reader.readAsText(file);
});

btnClearGlossary.onclick = () => {
  if (!confirm("Clear glossary?")) return;
  model.glossary = {};
  saveState();
  renderGlossary();
  renderParagraphs();
};

// Backups
btnMakeBackup.onclick = () => makeSnapshot();
btnDownloadProjectJson.onclick = () => {
  const pack = exportProject();
  downloadJSON(pack, `${normalizeFilename(projectNameEl.value || "project")}.project.json`);
};

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (e.ctrlKey && key === "s"){
    e.preventDefault();
    btnExportTxt.click();
    return;
  }
  if (e.ctrlKey && key === "f"){
    e.preventDefault();
    searchBoxEl.focus();
    return;
  }
  if (e.ctrlKey && key === "g"){
    e.preventDefault();
    openDrawer(drawerGlossary);
    renderGlossary();
    glossKeyEl.focus();
    return;
  }
  if (e.ctrlKey && e.key === "Enter"){
    const idx = lastFocusedIndex;
    const p = model.paragraphs[idx];
    if (!p) return;
    p.done = true;
    p.skipped = false;
    saveState();
    updateProgress();
    renderParagraphs();
    autoAdvanceIfEnabled(idx);
    return;
  }
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")){
    e.preventDefault();
    if (e.key === "ArrowDown") btnNext.click();
    else btnPrev.click();
  }
});

// ---------- Auto-backup timer ----------
let autoBackupTimer = null;
function startAutoBackup(){
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(() => {
    if (!toggleAutoBackupEl.checked) return;
    if (!model.paragraphs.length) return;
    makeSnapshot();
  }, AUTO_BACKUP_MS);
}

// ---------- Boot ----------
loadState();
startAutoBackup();
renderParagraphs();
updateProgress();
