/* ChapterCraft — Production Translator Workspace
   - Focus-first workflow
   - Keyboard-safe bottom bar (iOS/Android) via visualViewport => --kb
   - Modern Jump sheet (no prompt)
   - List pagination for performance
   - Progress counts skipped as completed (toggleable)
   - Schema-versioned import/export
*/

const STORAGE_KEY = "cc_workspace_prod_v1";
const SCHEMA_VERSION = 1;

const LIST_PAGE_SIZE = 25;

const state = {
  schemaVersion: SCHEMA_VERSION,
  view: "focus", // focus | list
  prefs: {
    theme: "dark",       // dark | light
    autoFocus: true,
    countSkipped: true,
    editorSize: 17
  },
  project: {
    projectName: "",
    fileName: "",
    splitMode: "blanklines", // blanklines | lines
    createdAt: "",
    updatedAt: "",
    paragraphs: [],
    translations: [],
    skipped: []
  },
  focusIndex: 0,
  list: {
    cursor: 0
  },
  _saveTimer: null
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const el = {
  projectMeta: $("projectMeta"),
  setupChip: $("setupChip"),

  progressFill: $("progressFill"),
  progressText: $("progressText"),
  saveStatus: $("saveStatus"),

  btnToggleView: $("btnToggleView"),
  viewLabel: $("viewLabel"),
  btnOpenTools: $("btnOpenTools"),
  btnCloseTools: $("btnCloseTools"),
  toolsDrawer: $("toolsDrawer"),
  drawerBackdrop: $("drawerBackdrop"),

  // setup
  projectName: $("projectName"),
  fileName: $("fileName"),
  splitMode: $("splitMode"),
  fontSize: $("fontSize"),
  rawText: $("rawText"),
  btnLoad: $("btnLoad"),
  btnClearSetup: $("btnClearSetup"),

  // focus
  focusView: $("focusView"),
  listView: $("listView"),
  focusIndex: $("focusIndex"),
  pillStatus: $("pillStatus"),
  focusOriginal: $("focusOriginal"),
  focusEditor: $("focusEditor"),
  btnClearOne: $("btnClearOne"),
  btnSkipOne: $("btnSkipOne"),
  btnCopyOriginal: $("btnCopyOriginal"),
  btnCopyTranslation: $("btnCopyTranslation"),

  // bottom bar
  btnPrev: $("btnPrev"),
  btnNext: $("btnNext"),
  btnJump: $("btnJump"),
  btnNextUntranslated: $("btnNextUntranslated"),

  // list
  list: $("list"),
  search: $("search"),
  filter: $("filter"),
  btnLoadMore: $("btnLoadMore"),
  listFootHint: $("listFootHint"),

  // tools
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  btnReset: $("btnReset"),
  btnTheme: $("btnTheme"),
  autoFocus: $("autoFocus"),
  countSkipped: $("countSkipped"),
  btnCopyAllCompleted: $("btnCopyAllCompleted"),

  // jump sheet
  jumpSheet: $("jumpSheet"),
  btnCloseJump: $("btnCloseJump"),
  jumpBackdrop: $("jumpBackdrop"),
  btnJumpCancel: $("btnJumpCancel"),
  btnJumpGo: $("btnJumpGo"),
  jumpInput: $("jumpInput"),
  jumpSub: $("jumpSub"),

  // to top
  toTop: $("toTop")
};

// ---------- Utils ----------
function nowISO(){ return new Date().toISOString(); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function isLoaded(){
  return !!(state.project.projectName && state.project.fileName && state.project.paragraphs.length);
}

function applyTheme(){
  document.documentElement.dataset.theme = state.prefs.theme === "light" ? "light" : "dark";
}
function applyEditorSize(){
  document.documentElement.style.setProperty("--editor-size", `${state.prefs.editorSize}px`);
}

function setStatus(text){
  el.saveStatus.textContent = text;
}

function markDirty(reason){
  // non-blocking feedback, avoids alert spam
  if (reason) setStatus(reason);
  if (state._saveTimer) clearTimeout(state._saveTimer);
  setStatus("Saving…");
  state._saveTimer = setTimeout(() => {
    saveToStorage();
    setStatus("Saved ✓");
  }, 250);
}

function splitParagraphs(text, mode){
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  if (mode === "lines"){
    return raw.split("\n").map(s => s.trim()).filter(Boolean);
  }
  return raw.split(/\n\s*\n+/g).map(s => s.trim()).filter(Boolean);
}

function ensureArrays(){
  const n = state.project.paragraphs.length;
  state.project.translations = state.project.translations || [];
  state.project.skipped = state.project.skipped || [];
  state.project.translations.length = n;
  state.project.skipped.length = n;

  for (let i=0;i<n;i++){
    if (typeof state.project.translations[i] !== "string") state.project.translations[i] = "";
    if (typeof state.project.skipped[i] !== "boolean") state.project.skipped[i] = false;
  }
}

// Completion definition (CEO decision default: count skipped)
function isCompleted(i){
  const t = (state.project.translations[i] || "").trim();
  const s = !!state.project.skipped[i];
  return state.prefs.countSkipped ? (t.length > 0 || s) : (t.length > 0);
}

function statusForIndex(i){
  if (!state.project.paragraphs.length) return "untranslated";
  if (state.project.skipped[i]) return "skipped";
  const t = (state.project.translations[i] || "").trim();
  return t ? "done" : "untranslated";
}

function doneCount(){
  let d = 0;
  for (let i=0;i<state.project.paragraphs.length;i++){
    if (isCompleted(i)) d++;
  }
  return d;
}

function updateMeta(){
  if (!isLoaded()){
    el.projectMeta.textContent = "No project";
    el.setupChip.textContent = "Not loaded";
    return;
  }
  el.projectMeta.textContent = `${state.project.projectName} • ${state.project.fileName}`;
  el.setupChip.textContent = `Loaded • ${state.project.paragraphs.length} segments`;
}

function updateProgress(){
  const total = state.project.paragraphs.length || 0;
  if (!total){
    el.progressFill.style.width = "0%";
    el.progressText.textContent = "0 / 0 (0%)";
    el.progressFill.parentElement?.setAttribute("aria-valuenow", "0");
    return;
  }
  const done = doneCount();
  const pct = Math.round((done / total) * 100);
  el.progressFill.style.width = `${pct}%`;
  el.progressText.textContent = `${done} / ${total} (${pct}%)`;
  el.progressFill.parentElement?.setAttribute("aria-valuenow", String(pct));
}

function setPill(status){
  el.pillStatus.className = "pill";
  if (status === "done"){
    el.pillStatus.classList.add("pill--done");
    el.pillStatus.textContent = "done";
  } else if (status === "skipped"){
    el.pillStatus.classList.add("pill--skip");
    el.pillStatus.textContent = "skipped";
  } else {
    el.pillStatus.textContent = "untranslated";
  }
}

// ---------- Storage / migration ----------
function migrateIfNeeded(parsed){
  // Future-proof: handle schema upgrades here
  if (!parsed || typeof parsed !== "object") return null;

  const v = Number(parsed.schemaVersion || 0);
  if (v === SCHEMA_VERSION) return parsed;

  // Very safe fallback for unknown versions:
  // keep project + prefs if present; reset others.
  const safe = {
    schemaVersion: SCHEMA_VERSION,
    view: "focus",
    prefs: {
      theme: parsed.prefs?.theme === "light" ? "light" : "dark",
      autoFocus: !!parsed.prefs?.autoFocus,
      countSkipped: parsed.prefs?.countSkipped !== false,
      editorSize: Number(parsed.prefs?.editorSize || 17)
    },
    project: parsed.project || state.project,
    focusIndex: Number(parsed.focusIndex || 0),
    list: { cursor: 0 }
  };
  return safe;
}

function saveToStorage(){
  state.schemaVersion = SCHEMA_VERSION;
  state.project.updatedAt = nowISO();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateMeta();
  updateProgress();
}

function loadFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try{
    const parsed = JSON.parse(raw);
    const migrated = migrateIfNeeded(parsed);
    if (!migrated) return false;

    // Apply into state
    Object.assign(state, migrated);
    if (!state.prefs) state.prefs = { theme:"dark", autoFocus:true, countSkipped:true, editorSize:17 };
    if (!state.project) state.project = { projectName:"", fileName:"", splitMode:"blanklines", createdAt:"", updatedAt:"", paragraphs:[], translations:[], skipped:[] };
    if (!state.list) state.list = { cursor: 0 };
    ensureArrays();
    return true;
  }catch{
    return false;
  }
}

// ---------- Keyboard-safe bottom bar ----------
function updateKeyboardOffset(){
  // Works best on mobile; safe on desktop (kb stays 0)
  if (!window.visualViewport){
    document.documentElement.style.setProperty("--kb", "0px");
    return;
  }
  const vv = window.visualViewport;
  const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty("--kb", `${keyboard}px`);
}

if (window.visualViewport){
  window.visualViewport.addEventListener("resize", updateKeyboardOffset);
  window.visualViewport.addEventListener("scroll", updateKeyboardOffset);
}
window.addEventListener("resize", updateKeyboardOffset);

// Ensure caret not hidden when typing (extra safety)
function ensureEditorVisible(){
  const active = document.activeElement === el.focusEditor;
  if (!active) return;

  const rect = el.focusEditor.getBoundingClientRect();
  const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb")) || 0;

  // bottom bar approx height
  const barH = 74;
  const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  const safeBottom = viewportH - barH - Math.min(kb, viewportH);
  const overlap = rect.bottom - safeBottom;
  if (overlap > 8){
    window.scrollBy({ top: overlap + 12, behavior: "smooth" });
  }
}

// ---------- Drawer ----------
function openDrawer(){
  el.toolsDrawer.setAttribute("aria-hidden","false");
  // trap focus lightly: focus close button
  el.btnCloseTools.focus({ preventScroll: true });
}
function closeDrawer(){
  el.toolsDrawer.setAttribute("aria-hidden","true");
  el.btnOpenTools.focus({ preventScroll: true });
}

// ---------- Jump sheet ----------
function openJump(){
  if (!isLoaded()) return;
  const total = state.project.paragraphs.length;
  el.jumpSub.textContent = `Enter a number (1 — ${total}).`;
  el.jumpInput.value = String(state.focusIndex + 1);
  el.jumpSheet.setAttribute("aria-hidden","false");
  // Focus input after opening
  setTimeout(() => el.jumpInput.focus({ preventScroll: true }), 0);
}
function closeJump(){
  el.jumpSheet.setAttribute("aria-hidden","true");
  el.btnJump.focus({ preventScroll: true });
}
function jumpGo(){
  if (!isLoaded()) return;
  const total = state.project.paragraphs.length;
  const n = Number((el.jumpInput.value || "").trim());
  if (!Number.isFinite(n) || n < 1 || n > total){
    setStatus(`Invalid index (1 — ${total})`);
    el.jumpInput.focus();
    return;
  }
  goIndex(n - 1);
  closeJump();
}

// ---------- Clipboard ----------
async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    setStatus("Copied ✓");
    setTimeout(() => setStatus("Saved ✓"), 700);
  }catch{
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setStatus("Copied ✓");
    setTimeout(() => setStatus("Saved ✓"), 700);
  }
}

// ---------- View + Rendering ----------
function setView(view){
  state.view = view;
  el.viewLabel.textContent = view === "focus" ? "Focus" : "List";

  if (view === "focus"){
    el.listView.hidden = true;
    el.focusView.hidden = false;
    renderFocus();
  } else {
    el.focusView.hidden = true;
    el.listView.hidden = false;
    resetListPagination();
    renderList(true);
  }

  // Back-to-top only in list view
  updateTopVisibility(true);

  markDirty();
}

function renderFocus(){
  const total = state.project.paragraphs.length || 0;

  if (!total){
    el.focusIndex.textContent = "Index 0 / 0";
    el.focusOriginal.textContent = "Paste text in setup to begin.";
    el.focusEditor.value = "";
    setPill("untranslated");
    updateMeta();
    updateProgress();
    return;
  }

  state.focusIndex = clamp(state.focusIndex, 0, total - 1);

  el.focusIndex.textContent = `Index ${state.focusIndex + 1} / ${total}`;
  el.focusOriginal.textContent = state.project.paragraphs[state.focusIndex];

  const cur = state.project.translations[state.focusIndex] || "";
  if (el.focusEditor.value !== cur) el.focusEditor.value = cur;

  setPill(statusForIndex(state.focusIndex));

  updateMeta();
  updateProgress();

  if (state.prefs.autoFocus){
    requestAnimationFrame(() => {
      el.focusEditor.focus({ preventScroll: true });
      ensureEditorVisible();
    });
  }
}

function resetListPagination(){
  state.list.cursor = 0;
  el.list.innerHTML = "";
  el.listFootHint.textContent = "";
}

function passesFilters(i, q, filter){
  const st = statusForIndex(i);

  if (filter !== "all" && st !== filter) return false;

  if (q){
    const original = state.project.paragraphs[i] || "";
    const translation = state.project.translations[i] || "";
    const hit = original.toLowerCase().includes(q) || translation.toLowerCase().includes(q);
    if (!hit) return false;
  }
  return true;
}

function renderList(reset){
  if (!isLoaded()){
    el.list.innerHTML = `<div class="card"><div class="hint">Load a project first.</div></div>`;
    el.btnLoadMore.disabled = true;
    el.listFootHint.textContent = "";
    updateMeta();
    updateProgress();
    return;
  }

  el.btnLoadMore.disabled = false;

  if (reset) resetListPagination();

  const q = (el.search.value || "").trim().toLowerCase();
  const filter = el.filter.value;
  const total = state.project.paragraphs.length;

  // Collect indices that match (for hint + paging)
  const matches = [];
  for (let i=0;i<total;i++){
    if (passesFilters(i, q, filter)) matches.push(i);
  }

  const start = state.list.cursor;
  const end = Math.min(matches.length, start + LIST_PAGE_SIZE);
  const slice = matches.slice(start, end);

  for (const idx of slice){
    el.list.appendChild(renderListItem(idx));
  }

  state.list.cursor = end;

  if (matches.length === 0){
    el.list.innerHTML = `<div class="card"><div class="hint">No matches.</div></div>`;
    el.btnLoadMore.disabled = true;
    el.listFootHint.textContent = "";
    return;
  }

  el.listFootHint.textContent = `Showing ${end} of ${matches.length} matches.`;
  el.btnLoadMore.disabled = end >= matches.length;
}

function renderListItem(i){
  const st = statusForIndex(i);

  const item = document.createElement("section");
  item.className = "item";

  const top = document.createElement("div");
  top.className = "item__top";

  const left = document.createElement("div");
  left.className = "item__idx";
  left.textContent = `Index ${i + 1}`;

  const right = document.createElement("div");
  const pill = document.createElement("span");
  pill.className = "pill";
  if (st === "done") pill.classList.add("pill--done");
  if (st === "skipped") pill.classList.add("pill--skip");
  pill.textContent = st;
  right.appendChild(pill);

  top.appendChild(left);
  top.appendChild(right);

  const cols = document.createElement("div");
  cols.className = "item__cols";

  const colA = document.createElement("article");
  colA.className = "pane";
  colA.innerHTML = `<div class="pane__label">Original</div><div class="pane__body"></div>`;
  colA.querySelector(".pane__body").textContent = state.project.paragraphs[i];

  const colB = document.createElement("section");
  colB.className = "pane";
  colB.innerHTML = `<div class="pane__label">Translation</div>`;

  const ta = document.createElement("textarea");
  ta.className = "textarea";
  ta.placeholder = "Type translation…";
  ta.value = state.project.translations[i] || "";

  ta.addEventListener("input", () => {
    state.project.translations[i] = ta.value;
    updateProgress();
    markDirty();
    // update pill immediately
    const newSt = statusForIndex(i);
    pill.className = "pill";
    if (newSt === "done") pill.classList.add("pill--done");
    if (newSt === "skipped") pill.classList.add("pill--skip");
    pill.textContent = newSt;
  });

  const row = document.createElement("div");
  row.className = "minirow";

  const btnOpen = document.createElement("button");
  btnOpen.className = "btn btn--ghost";
  btnOpen.type = "button";
  btnOpen.textContent = "Open in Focus";
  btnOpen.addEventListener("click", () => {
    state.focusIndex = i;
    setView("focus");
  });

  const btnSkip = document.createElement("button");
  btnSkip.className = "btn";
  btnSkip.type = "button";
  btnSkip.textContent = state.project.skipped[i] ? "Unskip" : "Skip";
  btnSkip.addEventListener("click", () => {
    state.project.skipped[i] = !state.project.skipped[i];
    btnSkip.textContent = state.project.skipped[i] ? "Unskip" : "Skip";
    updateProgress();
    markDirty();
    const newSt = statusForIndex(i);
    pill.className = "pill";
    if (newSt === "done") pill.classList.add("pill--done");
    if (newSt === "skipped") pill.classList.add("pill--skip");
    pill.textContent = newSt;
  });

  row.appendChild(btnOpen);
  row.appendChild(btnSkip);

  colB.appendChild(ta);
  colB.appendChild(row);

  cols.appendChild(colA);
  cols.appendChild(colB);

  item.appendChild(top);
  item.appendChild(cols);

  return item;
}

// ---------- Navigation ----------
function goIndex(i){
  const total = state.project.paragraphs.length || 0;
  if (!total) return;
  state.focusIndex = clamp(i, 0, total - 1);
  renderFocus();
  markDirty();
}

function nextUnfinished(){
  const total = state.project.paragraphs.length || 0;
  if (!total) return;

  for (let i = state.focusIndex + 1; i < total; i++){
    if (!isCompleted(i)){
      goIndex(i);
      return;
    }
  }
  // wrap
  for (let i = 0; i <= state.focusIndex; i++){
    if (!isCompleted(i)){
      goIndex(i);
      return;
    }
  }
  setStatus("All completed ✓");
}

// ---------- Back to top (List only) ----------
function updateTopVisibility(forceHide){
  if (forceHide || state.view !== "list"){
    el.toTop.classList.remove("show");
    el.toTop.setAttribute("aria-hidden","true");
    return;
  }
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  if (y > 650){
    el.toTop.classList.add("show");
    el.toTop.setAttribute("aria-hidden","false");
  } else {
    el.toTop.classList.remove("show");
    el.toTop.setAttribute("aria-hidden","true");
  }
}

// ---------- Wire events ----------
el.btnOpenTools.addEventListener("click", openDrawer);
el.btnCloseTools.addEventListener("click", closeDrawer);
el.drawerBackdrop.addEventListener("click", closeDrawer);

el.btnToggleView.addEventListener("click", () => {
  setView(state.view === "focus" ? "list" : "focus");
});

el.btnLoad.addEventListener("click", () => {
  const projectName = (el.projectName.value || "").trim();
  const fileName = (el.fileName.value || "").trim();
  const splitMode = el.splitMode.value;

  if (!fileName){
    el.fileName.focus();
    setStatus("File name is required");
    return;
  }
  if (!projectName){
    el.projectName.focus();
    setStatus("Project name is required");
    return;
  }

  const paragraphs = splitParagraphs(el.rawText.value, splitMode);
  if (!paragraphs.length){
    el.rawText.focus();
    setStatus("Paste some text first");
    return;
  }

  state.project.projectName = projectName;
  state.project.fileName = fileName;
  state.project.splitMode = splitMode;
  if (!state.project.createdAt) state.project.createdAt = nowISO();
  state.project.paragraphs = paragraphs;

  // CEO decision for production: start clean per load
  state.project.translations = new Array(paragraphs.length).fill("");
  state.project.skipped = new Array(paragraphs.length).fill(false);
  ensureArrays();

  state.focusIndex = 0;
  state.list.cursor = 0;

  applyEditorSize();
  updateMeta();
  updateProgress();
  setView("focus");
  markDirty("Loaded ✓");
});

el.btnClearSetup.addEventListener("click", () => {
  el.projectName.value = "";
  el.fileName.value = "";
  el.rawText.value = "";
  setStatus("Setup cleared");
});

el.focusEditor.addEventListener("input", () => {
  if (!state.project.paragraphs.length) return;
  state.project.translations[state.focusIndex] = el.focusEditor.value;
  setPill(statusForIndex(state.focusIndex));
  updateProgress();
  markDirty();
  ensureEditorVisible();
});

el.focusEditor.addEventListener("focus", () => {
  // when keyboard opens, make sure visible
  setTimeout(() => ensureEditorVisible(), 50);
});

el.btnClearOne.addEventListener("click", () => {
  if (!state.project.paragraphs.length) return;
  state.project.translations[state.focusIndex] = "";
  el.focusEditor.value = "";
  setPill(statusForIndex(state.focusIndex));
  updateProgress();
  markDirty("Cleared");
  if (state.prefs.autoFocus) el.focusEditor.focus({ preventScroll: true });
});

el.btnSkipOne.addEventListener("click", () => {
  if (!state.project.paragraphs.length) return;
  state.project.skipped[state.focusIndex] = !state.project.skipped[state.focusIndex];
  setPill(statusForIndex(state.focusIndex));
  updateProgress();
  markDirty(state.project.skipped[state.focusIndex] ? "Skipped" : "Unskipped");
});

el.btnCopyOriginal.addEventListener("click", async () => {
  if (!state.project.paragraphs.length) return;
  await copyText(state.project.paragraphs[state.focusIndex]);
});
el.btnCopyTranslation.addEventListener("click", async () => {
  if (!state.project.paragraphs.length) return;
  await copyText(state.project.translations[state.focusIndex] || "");
});

el.btnPrev.addEventListener("click", () => goIndex(state.focusIndex - 1));
el.btnNext.addEventListener("click", () => goIndex(state.focusIndex + 1));
el.btnNextUntranslated.addEventListener("click", nextUnfinished);

el.btnJump.addEventListener("click", openJump);
el.btnCloseJump.addEventListener("click", closeJump);
el.jumpBackdrop.addEventListener("click", closeJump);
el.btnJumpCancel.addEventListener("click", closeJump);
el.btnJumpGo.addEventListener("click", jumpGo);
el.jumpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") jumpGo();
  if (e.key === "Escape") closeJump();
});

el.search.addEventListener("input", () => renderList(true));
el.filter.addEventListener("change", () => renderList(true));
el.btnLoadMore.addEventListener("click", () => renderList(false));

el.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => updateTopVisibility(false));

el.btnTheme.addEventListener("click", () => {
  state.prefs.theme = state.prefs.theme === "light" ? "dark" : "light";
  applyTheme();
  markDirty("Theme updated");
});
el.autoFocus.addEventListener("change", () => {
  state.prefs.autoFocus = el.autoFocus.checked;
  markDirty("Preference saved");
});
el.countSkipped.addEventListener("change", () => {
  state.prefs.countSkipped = el.countSkipped.checked;
  updateProgress();
  markDirty("Preference saved");
});

el.fontSize.addEventListener("change", () => {
  state.prefs.editorSize = Number(el.fontSize.value) || 17;
  applyEditorSize();
  markDirty("Font size saved");
});

el.btnExport.addEventListener("click", () => {
  const payload = JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safeName = (state.project.fileName || "chaptercraft").replace(/[^\w.-]+/g, "_");
  a.download = `${safeName}.project.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Exported ✓");
});

el.btnImport.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const txt = await file.text();
    try{
      const parsed = JSON.parse(txt);
      const migrated = migrateIfNeeded(parsed);
      if (!migrated) throw new Error("bad");

      // apply
      Object.assign(state, migrated);
      if (!state.prefs) state.prefs = { theme:"dark", autoFocus:true, countSkipped:true, editorSize:17 };
      if (!state.project) state.project = { projectName:"", fileName:"", splitMode:"blanklines", createdAt:"", updatedAt:"", paragraphs:[], translations:[], skipped:[] };
      if (!state.list) state.list = { cursor: 0 };
      ensureArrays();

      // sync UI
      el.projectName.value = state.project.projectName || "";
      el.fileName.value = state.project.fileName || "";
      el.splitMode.value = state.project.splitMode || "blanklines";
      el.fontSize.value = String(state.prefs.editorSize || 17);
      el.autoFocus.checked = !!state.prefs.autoFocus;
      el.countSkipped.checked = state.prefs.countSkipped !== false;

      applyTheme();
      applyEditorSize();
      updateMeta();
      updateProgress();
      setView(state.view === "list" ? "list" : "focus");
      saveToStorage();
      setStatus("Imported ✓");
      closeDrawer();
    }catch{
      setStatus("Import failed (invalid file)");
    }
  };
  input.click();
});

el.btnReset.addEventListener("click", () => {
  const ok = confirm("Reset will delete ALL local data for this app. Continue?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

el.btnCopyAllCompleted.addEventListener("click", async () => {
  if (!isLoaded()) return;
  const lines = [];
  for (let i=0;i<state.project.paragraphs.length;i++){
    if (!isCompleted(i)) continue;
    const t = (state.project.translations[i] || "").trim();
    // If skipped but empty, include a marker so it’s not silently lost
    if (t){
      lines.push(`[#${i+1}]\n${t}\n`);
    } else if (state.project.skipped[i]) {
      lines.push(`[#${i+1}] (skipped)\n`);
    }
  }
  await copyText(lines.join("\n"));
});

// Global ESC to close overlays
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape"){
    if (el.jumpSheet.getAttribute("aria-hidden") === "false") closeJump();
    if (el.toolsDrawer.getAttribute("aria-hidden") === "false") closeDrawer();
  }

  // Keyboard navigation in Focus (when NOT typing)
  const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement?.tagName || ""));
  if (typing) return;

  if (e.key === "j" || e.key === "ArrowRight") goIndex(state.focusIndex + 1);
  if (e.key === "k" || e.key === "ArrowLeft") goIndex(state.focusIndex - 1);
});

// ---------- Init ----------
function syncControlsFromState(){
  el.projectName.value = state.project.projectName || "";
  el.fileName.value = state.project.fileName || "";
  el.splitMode.value = state.project.splitMode || "blanklines";
  el.fontSize.value = String(state.prefs.editorSize || 17);
  el.autoFocus.checked = !!state.prefs.autoFocus;
  el.countSkipped.checked = state.prefs.countSkipped !== false;
}

function init(){
  loadFromStorage();
  ensureArrays();

  applyTheme();
  applyEditorSize();
  syncControlsFromState();

  updateKeyboardOffset();
  updateMeta();
  updateProgress();

  setStatus(isLoaded() ? "Saved ✓" : "Ready");
  setView(state.view === "list" ? "list" : "focus");
  saveToStorage();

  // Improve mobile caret visibility when keyboard changes
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", () => {
      updateKeyboardOffset();
      ensureEditorVisible();
    });
  }
}
init();
