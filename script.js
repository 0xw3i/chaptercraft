/* ChapterCraft — Combined Desktop + Mobile
   - Desktop: cards + glossary + backups + filters + focus
   - Mobile: single paragraph flow (clean)
   - Same data model for both
*/

const STORAGE_KEY = "chaptercraft_combined_v1";
const PAGE_SIZE = 40;
const MAX_BACKUPS = 12;
const AUTO_BACKUP_MS = 2 * 60 * 1000;

// ---------- Elements ----------
const setupPanel = document.getElementById("setupPanel");

const desktopScreen = document.getElementById("desktopScreen");
const mobileScreen = document.getElementById("mobileScreen");

const modeToggle = document.getElementById("modeToggle");
const themeToggle = document.getElementById("themeToggle");

const btnTools = document.getElementById("btnTools");
const toolsMenu = document.getElementById("toolsMenu");
const btnGlossary = document.getElementById("btnGlossary");
const btnBackups = document.getElementById("btnBackups");
const btnCheck = document.getElementById("btnCheck");
const btnExportProject = document.getElementById("btnExportProject");
const btnImportProject = document.getElementById("btnImportProject");
const hiddenProjectImport = document.getElementById("hiddenProjectImport");

const progressTextTopEl = document.getElementById("progressTextTop");
const progressFillTopEl = document.getElementById("progressFillTop");

const fileInput = document.getElementById("fileInput");
const btnSplit = document.getElementById("btnSplit");
const btnClearAll = document.getElementById("btnClearAll");

const projectNameEl = document.getElementById("projectName");
const chapterNameEl = document.getElementById("chapterName");
const rawTextEl = document.getElementById("rawText");

const toggleAutoAdvanceEl = document.getElementById("toggleAutoAdvance");
const toggleDialogueToolsEl = document.getElementById("toggleDialogueTools");
const toggleAutoBackupEl = document.getElementById("toggleAutoBackup");

const searchBoxEl = document.getElementById("searchBox");
const filterModeEl = document.getElementById("filterMode");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnFocus = document.getElementById("btnFocus");
const btnExportTxt = document.getElementById("btnExportTxt");
const btnExportReview = document.getElementById("btnExportReview");
const paragraphsDiv = document.getElementById("paragraphs");

const mOriginal = document.getElementById("mOriginal");
const mTranslation = document.getElementById("mTranslation");
const mPrev = document.getElementById("mPrev");
const mNext = document.getElementById("mNext");
const mDone = document.getElementById("mDone");
const mSkip = document.getElementById("mSkip");
const mExport = document.getElementById("mExport");
const mGoSetup = document.getElementById("mGoSetup");

const backToTopBtn = document.getElementById("backToTop");

// drawers
const drawerGlossary = document.getElementById("drawerGlossary");
const btnCloseGlossary = document.getElementById("btnCloseGlossary");
const glossKeyEl = document.getElementById("glossKey");
const glossValEl = document.getElementById("glossVal");
const btnAddGloss = document.getElementById("btnAddGloss");
const glossSearchEl = document.getElementById("glossSearch");
const glossListEl = document.getElementById("glossList");
const btnExportGlossary = document.getElementById("btnExportGlossary");
const btnImportGlossary = document.getElementById("btnImportGlossary");
const btnClearGlossary = document.getElementById("btnClearGlossary");
const hiddenGlossaryImport = document.getElementById("hiddenGlossaryImport");

const drawerBackups = document.getElementById("drawerBackups");
const btnCloseBackups = document.getElementById("btnCloseBackups");
const backupListEl = document.getElementById("backupList");
const btnMakeBackup = document.getElementById("btnMakeBackup");
const btnDownloadProjectJson = document.getElementById("btnDownloadProjectJson");

const drawerCheck = document.getElementById("drawerCheck");
const btnCloseCheck = document.getElementById("btnCloseCheck");
const checkReportEl = document.getElementById("checkReport");

// ---------- State ----------
let visibleCount = PAGE_SIZE;
let focusMode = false;

// mode: "auto" | "desktop" | "mobile"
let modePref = "auto";
let currentIndex = 0;

let model = {
  theme: "dark",
  projectName: "",
  chapterName: "",
  rawText: "",
  ui: {
    autoAdvance: true,
    dialogueTools: true,
    autoBackup: true
  },
  glossary: {},
  backups: [],
  paragraphs: [] // { original, translation, done, skipped }
};

// ---------- Utils ----------
function safeParseJSON(text){ try { return JSON.parse(text); } catch { return null; } }
function escapeHtml(str){
  return (str ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeFilename(name){
  return (name || "translation").trim().replaceAll(/[\\/:*?"<>|]/g, "-").slice(0, 140) || "translation";
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
async function copyToClipboard(text){ try{ await navigator.clipboard.writeText(text); }catch{} }

function openDrawer(el){ el.setAttribute("aria-hidden","false"); }
function closeDrawer(el){ el.setAttribute("aria-hidden","true"); }
function drawerClickOutsideToClose(drawer){
  drawer.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(drawer); });
}

// ---------- Theme ----------
function applyTheme(theme){
  model.theme = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", model.theme);
  themeToggle.textContent = model.theme === "light" ? "☀️" : "🌙";
}

// ---------- Dialogue highlighting ----------
const QUOTE_PAIRS = [
  ['"', '"'], ['“','”'], ["'","'"], ['‘','’'], ['`','`'],
  ['«','»'], ['「','」'], ['『','』']
];

function highlightDialogues(text){
  let safe = escapeHtml(text || "");

  for (const [L,R] of QUOTE_PAIRS){
    const l = escapeRegExp(escapeHtml(L));
    const r = escapeRegExp(escapeHtml(R));
    const re = new RegExp(`${l}([\\s\\S]*?)${r}`, "g");
    safe = safe.replace(re, (m, p1) => `${escapeHtml(L)}<span class="dialogue">${escapeHtml(p1)}</span>${escapeHtml(R)}`);
  }

  safe = safe.replace(/^(\s*[-—–]\s+)(.+)$/gm, (m, prefix, rest) => {
    return `${escapeHtml(prefix)}<span class="dialogue">${escapeHtml(rest)}</span>`;
  });

  return safe;
}

function hasDialogue(text){
  const t = text || "";
  if (/^\s*[-—–]\s+/m.test(t)) return true;
  for (const [L,R] of QUOTE_PAIRS){
    if (t.includes(L) && t.includes(R)) return true;
  }
  return false;
}

// ---------- Progress ----------
function statusOf(p){
  if (p.skipped) return "skipped";
  if (p.done || ((p.translation||"").trim().length > 0)) return "done";
  return "untranslated";
}

function updateProgress(){
  const total = model.paragraphs.length;
  const done = model.paragraphs.filter(p => !p.skipped && ((p.translation||"").trim().length > 0 || p.done)).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  progressTextTopEl.textContent = `${done} / ${total} (${pct}%)`;
  progressFillTopEl.style.width = `${pct}%`;
}

// ---------- Persistence ----------
function saveState(){
  model.projectName = projectNameEl.value || "";
  model.chapterName = chapterNameEl.value || "";
  model.rawText = rawTextEl.value || "";
  model.ui.autoAdvance = !!toggleAutoAdvanceEl.checked;
  model.ui.dialogueTools = !!toggleDialogueToolsEl.checked;
  model.ui.autoBackup = !!toggleAutoBackupEl.checked;

  const payload = {
    ...model,
    modePref,
    currentIndex,
    focusMode,
    visibleCount
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

  model = { ...model, ...parsed };
  modePref = parsed.modePref || "auto";
  currentIndex = Number.isInteger(parsed.currentIndex) ? parsed.currentIndex : 0;
  focusMode = !!parsed.focusMode;
  visibleCount = Number.isInteger(parsed.visibleCount) ? parsed.visibleCount : PAGE_SIZE;

  applyTheme(model.theme || "dark");
  projectNameEl.value = model.projectName || "";
  chapterNameEl.value = model.chapterName || "";
  rawTextEl.value = model.rawText || "";

  toggleAutoAdvanceEl.checked = !!(model.ui?.autoAdvance ?? true);
  toggleDialogueToolsEl.checked = !!(model.ui?.dialogueTools ?? true);
  toggleAutoBackupEl.checked = !!(model.ui?.autoBackup ?? true);

  if (!Array.isArray(model.paragraphs)) model.paragraphs = [];
  if (!Array.isArray(model.backups)) model.backups = [];
  if (!model.glossary || typeof model.glossary !== "object") model.glossary = {};

  updateProgress();
}

// ---------- Mode resolution ----------
function isMobileWidth(){ return window.matchMedia("(max-width: 820px)").matches; }

function resolvedMode(){
  if (modePref === "desktop") return "desktop";
  if (modePref === "mobile") return "mobile";
  return isMobileWidth() ? "mobile" : "desktop";
}

function setModeButtonLabel(){
  const r = resolvedMode();
  const suffix = (modePref === "auto") ? "Auto" : (modePref === "desktop" ? "Desktop" : "Mobile");
  modeToggle.textContent = `Mobile: ${suffix}${r === "mobile" ? " ✓" : ""}`;
}

// ---------- Tools menu ----------
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
document.addEventListener("click", (e) => {
  if (!btnTools.contains(e.target) && !toolsMenu.contains(e.target)) closeToolsMenu();
});

// ---------- Export ----------
function buildExportFilename(){
  const p = (projectNameEl.value || "").trim();
  const c = (chapterNameEl.value || "").trim();
  if (!p || !c) return null;
  return `${normalizeFilename(p)} - ${normalizeFilename(c)}.txt`;
}

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

// ---------- Desktop render ----------
function matchesSearch(p, q){
  if (!q) return true;
  const hay = ((p.original||"") + "\n" + (p.translation||"")).toLowerCase();
  return hay.includes(q.toLowerCase());
}
function matchesFilter(p, f){
  if (f === "all") return true;
  if (f === "dialogue") return hasDialogue(p.original||"");
  return statusOf(p) === f;
}
function matchingIndexes(){
  const q = (searchBoxEl.value || "").trim();
  const f = filterModeEl.value || "untranslated";
  const out = [];
  for (let i=0;i<model.paragraphs.length;i++){
    const p = model.paragraphs[i];
    if (!matchesSearch(p, q)) continue;
    if (!matchesFilter(p, f)) continue;
    out.push(i);
  }
  return out;
}
function nextIndexFrom(current, dir=+1){
  const idxs = matchingIndexes();
  if (!idxs.length) return -1;
  const pos = idxs.indexOf(current);
  let start = (pos === -1) ? (dir > 0 ? 0 : idxs.length - 1) : (pos + dir);
  for (let k=start; k>=0 && k<idxs.length; k+=dir){
    return idxs[k];
  }
  return -1;
}

function glossaryMatchesForOriginal(original){
  const o = original || "";
  const keys = Object.keys(model.glossary || {});
  const matches = [];
  for (const k of keys){
    if (k && o.includes(k)) matches.push({k, v: model.glossary[k]});
  }
  matches.sort((a,b) => b.k.length - a.k.length);
  return matches.slice(0, 10);
}
function insertAtCursor(textarea, text){
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
}

function renderGlossaryInlineChips(card, p){
  const matches = glossaryMatchesForOriginal(p.original || "");
  if (!matches.length) return;

  const row = document.createElement("div");
  row.className = "chips";

  const ta = card.querySelector("textarea.main-translation");
  for (const m of matches){
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = `${m.k} → ${m.v}`;
    chip.onclick = () => {
      insertAtCursor(ta, m.v);
      p.translation = ta.value;
      p.skipped = false;
      saveState();
      updateProgress();
      ta.focus();
      refreshBadge(card, p);
    };
    row.appendChild(chip);
  }

  card.querySelector(".pane.translation").appendChild(row);
}

function refreshBadge(card, p){
  const badge = card.querySelectorAll(".badge")[1];
  const st = statusOf(p);
  badge.textContent = st === "done" ? "✅ done" : st === "skipped" ? "⏭ skipped" : "… untranslated";
  badge.className = `badge ${st === "done" ? "good" : ""}`;
}

function renderCard(idx){
  const p = model.paragraphs[idx];
  const st = statusOf(p);

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.idx = idx;

  card.innerHTML = `
    <div class="card-head">
      <div class="badge">Paragraph ${idx + 1}</div>
      <div class="badge ${st === "done" ? "good" : ""}">${st === "done" ? "✅ done" : st === "skipped" ? "⏭ skipped" : "… untranslated"}</div>
    </div>

    <div class="card-body">
      <div class="pane original"></div>
      <div class="pane translation">
        <div class="translation">
          <textarea class="main-translation" placeholder="Translate here..."></textarea>
        </div>

        <div class="card-actions">
          <button class="btn" data-act="done">Done</button>
          <button class="btn danger" data-act="skip">Skip</button>
          <button class="btn danger" data-act="clear">Clear</button>
          <span class="small" style="margin-left:auto">Index: ${idx+1}</span>
        </div>
      </div>
    </div>
  `;

  const origPane = card.querySelector(".pane.original");
  origPane.innerHTML = toggleDialogueToolsEl.checked ? highlightDialogues(p.original || "") : escapeHtml(p.original || "");

  const ta = card.querySelector("textarea.main-translation");
  ta.value = p.translation || "";

  ta.addEventListener("focus", () => {
    currentIndex = idx;
    saveState();
  });

  ta.addEventListener("input", () => {
    p.translation = ta.value;
    if ((p.translation||"").trim().length > 0) p.skipped = false;
    saveState();
    updateProgress();
    refreshBadge(card, p);
    // keep mobile in sync if user switches
    if (resolvedMode() === "mobile") renderMobile();
  });

  renderGlossaryInlineChips(card, p);

  card.querySelector('[data-act="done"]').onclick = () => {
    p.done = true;
    p.skipped = false;
    saveState();
    updateProgress();
    renderDesktop();
    if (toggleAutoAdvanceEl.checked){
      const nxt = nextIndexFrom(idx, +1);
      if (nxt !== -1) { currentIndex = nxt; saveState(); scrollToCard(nxt); }
    }
  };

  card.querySelector('[data-act="skip"]').onclick = () => {
    p.skipped = true;
    p.done = false;
    saveState();
    updateProgress();
    renderDesktop();
    if (toggleAutoAdvanceEl.checked){
      const nxt = nextIndexFrom(idx, +1);
      if (nxt !== -1) { currentIndex = nxt; saveState(); scrollToCard(nxt); }
    }
  };

  card.querySelector('[data-act="clear"]').onclick = () => {
    if (!confirm("Clear translation for this paragraph?")) return;
    p.translation = "";
    p.done = false;
    p.skipped = false;
    saveState();
    updateProgress();
    renderDesktop();
    scrollToCard(idx);
  };

  return card;
}

function scrollToCard(idx){
  const el = document.querySelector(`[data-idx="${idx}"]`);
  if (!el) return;
  el.scrollIntoView({behavior:"smooth", block:"center"});
  const ta = el.querySelector("textarea");
  if (ta) ta.focus();
}

function renderDesktop(){
  paragraphsDiv.innerHTML = "";
  const idxs = matchingIndexes();
  const slice = idxs.slice(0, visibleCount);

  if (focusMode){
    const chosen = idxs.includes(currentIndex) ? currentIndex : (idxs[0] ?? -1);
    if (chosen === -1){
      paragraphsDiv.innerHTML = `<div class="card"><div class="card-head"><div class="badge">No match</div><div class="badge"></div></div></div>`;
      return;
    }
    paragraphsDiv.appendChild(renderCard(chosen));
    return;
  }

  for (const idx of slice){
    paragraphsDiv.appendChild(renderCard(idx));
  }

  if (idxs.length > visibleCount){
    const more = document.createElement("button");
    more.className = "btn";
    more.textContent = `Load more (${Math.min(PAGE_SIZE, idxs.length - visibleCount)})`;
    more.onclick = () => { visibleCount += PAGE_SIZE; renderDesktop(); saveState(); };
    paragraphsDiv.appendChild(more);
  }
}

// ---------- Mobile render ----------
function renderMobile(){
  const p = model.paragraphs[currentIndex];
  if (!p){
    mOriginal.innerHTML = `<div class="small">No paragraphs yet. Use Setup to split text.</div>`;
    mTranslation.value = "";
    return;
  }

  mOriginal.innerHTML = toggleDialogueToolsEl.checked ? highlightDialogues(p.original || "") : escapeHtml(p.original || "");
  mTranslation.value = p.translation || "";
  updateProgress();
}

// ---------- Glossary drawer ----------
function glossEntries(){
  const q = (glossSearchEl.value || "").trim().toLowerCase();
  const items = Object.entries(model.glossary || {}).map(([k,v]) => ({k,v})).sort((a,b)=>a.k.localeCompare(b.k));
  if (!q) return items;
  return items.filter(it => it.k.toLowerCase().includes(q) || it.v.toLowerCase().includes(q));
}
function renderGlossary(){
  glossListEl.innerHTML = "";
  const items = glossEntries();
  if (!items.length){
    glossListEl.innerHTML = `<div class="item"><div class="kv"><div class="k">No glossary entries</div><div class="v">Add names/terms for consistency.</div></div></div>`;
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
        <button class="btn" data-act="copy">Copy</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>
    `;
    row.querySelector('[data-act="copy"]').onclick = () => copyToClipboard(it.v);
    row.querySelector('[data-act="del"]').onclick = () => { delete model.glossary[it.k]; saveState(); renderGlossary(); renderDesktop(); renderMobile(); };
    glossListEl.appendChild(row);
  }
}

// ---------- Backups ----------
function makeSnapshot(){
  const snap = {
    theme: model.theme,
    projectName: projectNameEl.value || "",
    chapterName: chapterNameEl.value || "",
    ui: {
      autoAdvance: !!toggleAutoAdvanceEl.checked,
      dialogueTools: !!toggleDialogueToolsEl.checked,
      autoBackup: !!toggleAutoBackupEl.checked
    },
    glossary: model.glossary || {},
    rawText: rawTextEl.value || "",
    paragraphs: model.paragraphs || [],
    currentIndex
  };

  const ts = Date.now();
  const size = JSON.stringify(snap).length;
  model.backups = model.backups || [];
  model.backups.unshift({ ts, size, snapshot: snap });
  if (model.backups.length > MAX_BACKUPS) model.backups.length = MAX_BACKUPS;

  saveState();
  renderBackups();
}
function renderBackups(){
  backupListEl.innerHTML = "";
  const list = model.backups || [];
  if (!list.length){
    backupListEl.innerHTML = `<div class="item"><div class="kv"><div class="k">No backups</div><div class="v">Enable auto backups or make a snapshot.</div></div></div>`;
    return;
  }
  for (const b of list){
    const d = new Date(b.ts);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="kv">
        <div class="k">${d.toLocaleString()}</div>
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
    row.querySelector('[data-act="download"]').onclick = () => downloadJSON(b.snapshot, `snapshot-${b.ts}.json`);
    row.querySelector('[data-act="del"]').onclick = () => {
      model.backups = model.backups.filter(x => x.ts !== b.ts);
      saveState(); renderBackups();
    };
    backupListEl.appendChild(row);
  }
}
function loadSnapshot(snap){
  model.theme = snap.theme || "dark";
  model.projectName = snap.projectName || "";
  model.chapterName = snap.chapterName || "";
  model.ui = snap.ui || model.ui;
  model.glossary = snap.glossary || {};
  model.rawText = snap.rawText || "";
  model.paragraphs = Array.isArray(snap.paragraphs) ? snap.paragraphs : [];
  currentIndex = Number.isInteger(snap.currentIndex) ? snap.currentIndex : 0;

  applyTheme(model.theme);
  projectNameEl.value = model.projectName;
  chapterNameEl.value = model.chapterName;
  rawTextEl.value = model.rawText;

  toggleAutoAdvanceEl.checked = !!(model.ui?.autoAdvance ?? true);
  toggleDialogueToolsEl.checked = !!(model.ui?.dialogueTools ?? true);
  toggleAutoBackupEl.checked = !!(model.ui?.autoBackup ?? true);

  visibleCount = PAGE_SIZE;
  focusMode = false;
  saveState();

  updateProgress();
  renderGlossary();
  renderBackups();
  renderUI();
}

// ---------- Check ----------
function showCheck(){
  const total = model.paragraphs.length;
  const untranslated = model.paragraphs.filter(p => statusOf(p)==="untranslated").length;
  const skipped = model.paragraphs.filter(p => p.skipped).length;

  const rows = [];
  rows.push({ title: "Overview", body: `Total: ${total}\nUntranslated: ${untranslated}\nSkipped: ${skipped}` });

  const dlgUn = [];
  model.paragraphs.forEach((p,i)=>{ if(statusOf(p)==="untranslated" && hasDialogue(p.original||"")) dlgUn.push(i+1); });
  if (dlgUn.length) rows.push({ title: "Untranslated dialogue", body: `Paragraphs: ${dlgUn.slice(0,80).join(", ")}${dlgUn.length>80?"…":""}` });

  checkReportEl.innerHTML = "";
  for (const r of rows){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="kv"><div class="k">${escapeHtml(r.title)}</div><div class="v">${escapeHtml(r.body)}</div></div>`;
    checkReportEl.appendChild(el);
  }
}

// ---------- UI render (mode switch) ----------
function renderUI(){
  const mode = resolvedMode();
  setModeButtonLabel();

  desktopScreen.classList.toggle("active", mode === "desktop");
  mobileScreen.classList.toggle("active", mode === "mobile");

  // On mobile, hide heavy desktop-only controls visually by staying in mobile screen
  if (mode === "desktop"){
    renderDesktop();
  } else {
    renderMobile();
  }
}

// ---------- Back-to-top ----------
function updateBackToTopVisibility(){
  const show = window.scrollY > 600;
  backToTopBtn.setAttribute("aria-hidden", show ? "false" : "true");
}
window.addEventListener("scroll", updateBackToTopVisibility, { passive:true });
backToTopBtn.addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));

// ---------- Keyboard handling (mobile) ----------
(function setupKeyboardAwareLayout(){
  const setBottomPadding = (px) => { document.body.style.paddingBottom = px ? `${px}px` : ""; };
  const update = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keyboardPx = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const open = keyboardPx > 120;
    document.body.classList.toggle("kbd-open", open);
    if (open) setBottomPadding(Math.round(keyboardPx + 24));
    else setBottomPadding(0);
  };
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
  }
  window.addEventListener("resize", update);
  document.addEventListener("focusin", (e) => {
    if (e.target && e.target.tagName === "TEXTAREA"){
      setTimeout(() => { try{ e.target.scrollIntoView({behavior:"smooth", block:"center"}); }catch{} update(); }, 250);
    }
  });
  document.addEventListener("focusout", () => setTimeout(update, 120));
  update();
})();

// ---------- Events ----------
themeToggle.onclick = () => { applyTheme(model.theme === "light" ? "dark" : "light"); saveState(); };

modeToggle.onclick = () => {
  // cycle auto -> desktop -> mobile -> auto
  modePref = (modePref === "auto") ? "desktop" : (modePref === "desktop") ? "mobile" : "auto";
  saveState();
  renderUI();
};

btnTools.onclick = (e) => { e.stopPropagation(); toggleToolsMenu(); };

btnGlossary.onclick = () => { closeToolsMenu(); openDrawer(drawerGlossary); renderGlossary(); glossKeyEl.focus(); };
btnBackups.onclick = () => { closeToolsMenu(); openDrawer(drawerBackups); renderBackups(); };
btnCheck.onclick = () => { closeToolsMenu(); openDrawer(drawerCheck); showCheck(); };
btnExportProject.onclick = () => { closeToolsMenu(); downloadJSON(exportProjectPack(), `${normalizeFilename(projectNameEl.value||"project")}.project.json`); };
btnImportProject.onclick = () => { closeToolsMenu(); hiddenProjectImport.click(); };

document.addEventListener("resize", () => renderUI());

btnCloseGlossary.onclick = () => closeDrawer(drawerGlossary);
btnCloseBackups.onclick = () => closeDrawer(drawerBackups);
btnCloseCheck.onclick = () => closeDrawer(drawerCheck);
drawerClickOutsideToClose(drawerGlossary);
drawerClickOutsideToClose(drawerBackups);
drawerClickOutsideToClose(drawerCheck);

// Setup
fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { rawTextEl.value = reader.result; saveState(); };
  reader.readAsText(file);
});

btnSplit.onclick = () => {
  const project = (projectNameEl.value || "").trim();
  const chapter = (chapterNameEl.value || "").trim();
  const text = (rawTextEl.value || "").trim();

  if (!project) return alert("Project Name is required.");
  if (!chapter) return alert("Chapter Name is required.");
  if (!text) return alert("Paste chapter text first.");

  const parts = text.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
  model.paragraphs = parts.map(p => ({ original: p, translation:"", done:false, skipped:false }));
  currentIndex = 0;
  visibleCount = PAGE_SIZE;
  focusMode = false;

  saveState();
  updateProgress();
  makeSnapshot();
  renderUI();

  // jump to content
  window.scrollTo({top: 0, behavior:"smooth"});
};

btnClearAll.onclick = () => {
  if (!confirm("Clear everything? This removes local progress.")) return;
  const keepTheme = model.theme;

  model = {
    theme: keepTheme,
    projectName: "",
    chapterName: "",
    rawText: "",
    ui: { autoAdvance:true, dialogueTools:true, autoBackup:true },
    glossary: {},
    backups: [],
    paragraphs: []
  };

  projectNameEl.value = "";
  chapterNameEl.value = "";
  rawTextEl.value = "";
  searchBoxEl.value = "";
  filterModeEl.value = "untranslated";

  visibleCount = PAGE_SIZE;
  focusMode = false;
  currentIndex = 0;

  saveState();
  updateProgress();
  renderGlossary();
  renderBackups();
  renderUI();
};

// desktop controls
searchBoxEl.addEventListener("input", () => { visibleCount = PAGE_SIZE; renderDesktop(); saveState(); });
filterModeEl.addEventListener("change", () => { visibleCount = PAGE_SIZE; renderDesktop(); saveState(); });

btnPrev.onclick = () => {
  const prv = nextIndexFrom(currentIndex, -1);
  if (prv === -1) return alert("No previous match.");
  currentIndex = prv; saveState();
  if (focusMode) renderDesktop();
  scrollToCard(prv);
};

btnNext.onclick = () => {
  const nxt = nextIndexFrom(currentIndex, +1);
  if (nxt === -1) return alert("No next match.");
  currentIndex = nxt; saveState();
  if (focusMode) renderDesktop();
  scrollToCard(nxt);
};

btnFocus.onclick = () => {
  focusMode = !focusMode;
  btnFocus.textContent = focusMode ? "Focus: ON" : "Focus";
  saveState();
  renderDesktop();
};

btnExportTxt.onclick = () => {
  const fn = buildExportFilename();
  if (!fn) return alert("Project + Chapter name required for export.");
  downloadText(exportTranslationOnly(), fn);
};

btnExportReview.onclick = () => {
  const fn = buildExportFilename();
  if (!fn) return alert("Project + Chapter name required for export.");
  const name = fn.replace(/\.txt$/i, "-review.txt");
  downloadText(exportReviewFormat(), name);
};

toggleAutoAdvanceEl.addEventListener("change", saveState);
toggleDialogueToolsEl.addEventListener("change", () => { saveState(); renderUI(); });
toggleAutoBackupEl.addEventListener("change", saveState);

// mobile controls
mTranslation.addEventListener("input", () => {
  const p = model.paragraphs[currentIndex];
  if (!p) return;
  p.translation = mTranslation.value;
  if ((p.translation||"").trim().length > 0) p.skipped = false;
  saveState();
  updateProgress();
});

mPrev.onclick = () => { if (currentIndex > 0) { currentIndex--; saveState(); renderMobile(); } };
mNext.onclick = () => { if (currentIndex < model.paragraphs.length - 1) { currentIndex++; saveState(); renderMobile(); } };

mDone.onclick = () => {
  const p = model.paragraphs[currentIndex]; if (!p) return;
  p.done = true; p.skipped = false;
  saveState(); updateProgress();
  if (toggleAutoAdvanceEl.checked && currentIndex < model.paragraphs.length - 1) currentIndex++;
  saveState(); renderMobile();
};

mSkip.onclick = () => {
  const p = model.paragraphs[currentIndex]; if (!p) return;
  p.skipped = true; p.done = false;
  saveState(); updateProgress();
  if (toggleAutoAdvanceEl.checked && currentIndex < model.paragraphs.length - 1) currentIndex++;
  saveState(); renderMobile();
};

mExport.onclick = () => {
  const fn = buildExportFilename();
  if (!fn) return alert("Project + Chapter name required for export.");
  downloadText(exportTranslationOnly(), fn);
};

mGoSetup.onclick = () => {
  setupPanel.scrollIntoView({behavior:"smooth", block:"start"});
};

// Glossary actions
btnAddGloss.onclick = () => {
  const k = (glossKeyEl.value || "").trim();
  const v = (glossValEl.value || "").trim();
  if (!k || !v) return alert("Enter both term and translation.");
  model.glossary[k] = v;
  glossKeyEl.value = ""; glossValEl.value = "";
  saveState();
  renderGlossary();
  renderUI();
};

glossSearchEl.addEventListener("input", renderGlossary);

btnExportGlossary.onclick = () => downloadJSON({ glossary: model.glossary || {}, exportedAt: new Date().toISOString() },
  `${normalizeFilename(projectNameEl.value||"glossary")}.glossary.json`);

btnImportGlossary.onclick = () => hiddenGlossaryImport.click();
hiddenGlossaryImport.addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pack = safeParseJSON(reader.result);
    const g = pack?.glossary;
    if (!g || typeof g !== "object") return alert("Invalid glossary file.");
    model.glossary = { ...(model.glossary||{}), ...g };
    saveState();
    renderGlossary();
    renderUI();
  };
  reader.readAsText(file);
});

btnClearGlossary.onclick = () => {
  if (!confirm("Clear glossary?")) return;
  model.glossary = {};
  saveState();
  renderGlossary();
  renderUI();
};

// Backups actions
btnMakeBackup.onclick = () => makeSnapshot();
btnDownloadProjectJson.onclick = () => downloadJSON(exportProjectPack(), `${normalizeFilename(projectNameEl.value||"project")}.project.json`);
hiddenProjectImport.addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pack = safeParseJSON(reader.result);
    if (!pack?.snapshot) return alert("Invalid project file.");
    loadSnapshot(pack.snapshot);
    makeSnapshot();
  };
  reader.readAsText(file);
});

// Keyboard shortcuts (desktop)
document.addEventListener("keydown", (e) => {
  if (resolvedMode() !== "desktop") return;

  const key = e.key.toLowerCase();
  if (e.ctrlKey && key === "s"){
    e.preventDefault();
    btnExportTxt.click();
  }
  if (e.ctrlKey && e.key === "Enter"){
    const p = model.paragraphs[currentIndex];
    if (!p) return;
    p.done = true; p.skipped = false;
    saveState(); updateProgress(); renderDesktop();
    if (toggleAutoAdvanceEl.checked){
      const nxt = nextIndexFrom(currentIndex, +1);
      if (nxt !== -1) { currentIndex = nxt; saveState(); scrollToCard(nxt); }
    }
  }
});

// Auto-backup timer
let autoBackupTimer = null;
function startAutoBackup(){
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(() => {
    if (!toggleAutoBackupEl.checked) return;
    if (!model.paragraphs.length) return;
    makeSnapshot();
  }, AUTO_BACKUP_MS);
}

// Export Project Pack
function exportProjectPack(){
  return {
    version: "chaptercraft_combined_v1",
    exportedAt: new Date().toISOString(),
    snapshot: {
      theme: model.theme,
      projectName: projectNameEl.value || "",
      chapterName: chapterNameEl.value || "",
      ui: {
        autoAdvance: !!toggleAutoAdvanceEl.checked,
        dialogueTools: !!toggleDialogueToolsEl.checked,
        autoBackup: !!toggleAutoBackupEl.checked
      },
      glossary: model.glossary || {},
      rawText: rawTextEl.value || "",
      paragraphs: model.paragraphs || [],
      currentIndex
    }
  };
}

// ---------- Boot ----------
loadState();
setModeButtonLabel();
startAutoBackup();
renderGlossary();
renderBackups();
renderUI();
updateBackToTopVisibility();
