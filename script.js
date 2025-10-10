// ---------- tiny DOM helpers ----------
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// ---------- state ----------
const state = { current: null, favs: [] };

// ---------- elements ----------
const statusEl   = $("#status");
const favListEl  = $("#favList");
const favCountEl = $("#favCount");

// ---------- tabs ----------
const tabs = $$(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
function setTab(name){
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("#pane-random").hidden = name !== "random";
  $("#pane-search").hidden = name !== "search";
  statusEl.textContent = "";
}
setTab("random");

// ======== favorites helpers ========
function persistFavs(){ try{ localStorage.setItem("cf:favs", JSON.stringify(state.favs)); }catch{} }
function loadFavs(){ try{ state.favs = JSON.parse(localStorage.getItem("cf:favs") || "[]"); }catch{ state.favs = []; } }
function isSaved(id){ return state.favs.some(x => x.idDrink === id); }
function minify(d){
  return {
    idDrink:d.idDrink, strDrink:d.strDrink, strDrinkThumb:d.strDrinkThumb,
    strCategory:d.strCategory, strAlcoholic:d.strAlcoholic, strGlass:d.strGlass,
    ingredients: ingredientsList(d), strInstructions:d.strInstructions
  };
}
function dedupeAndCap(){
  const seen = new Set();
  state.favs = state.favs
    .filter(x => seen.has(x.idDrink) ? false : (seen.add(x.idDrink), true))
    .slice(0,20);
}
function setCurrent(drink){
  state.current = drink || null;
  updateSaveButtons();
}

// ---------- favorites UI ----------
loadFavs(); renderFavs();

function renderFavs(){
  favListEl.innerHTML = "";
  favCountEl.textContent = String(state.favs.length);

  for(const f of state.favs){
    const li = document.createElement("li");
    li.className = "fav-item";
    li.innerHTML = `
      <img class="fav-thumb" src="${f.strDrinkThumb}" alt="${f.strDrink}">
      <div class="grow fav-title">${f.strDrink}</div>
      <div class="fav-actions">
        <button class="btn btn-open" data-id="${f.idDrink}">Open</button>
        <button class="btn btn-remove" data-id="${f.idDrink}">Remove</button>
      </div>
    `;
    favListEl.appendChild(li);
  }

  favListEl.querySelectorAll(".btn-open").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = state.favs.find(x => x.idDrink === btn.dataset.id);
      if (!f) return;
      openDrink(f);
    });
  });
  favListEl.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      state.favs = state.favs.filter(x => x.idDrink !== btn.dataset.id);
      persistFavs();
      renderFavs();
      if (state.current && state.current.idDrink === btn.dataset.id) updateSaveButtons();
      updateSearchSaveButtons();
    });
  });
}

// Clear all with undo toast
$("#clearFavs").addEventListener("click", () => {
  if (state.favs.length === 0) return;
  const prev = [...state.favs];
  state.favs = [];
  persistFavs();
  renderFavs();
  updateSearchSaveButtons();

  showToast(`Removed ${prev.length} saved drink(s).`, () => {
    state.favs = prev;
    persistFavs();
    renderFavs();
    updateSearchSaveButtons();
  });
});

function toggleSave(drink){
  if(!drink) return;
  const i = state.favs.findIndex(x => x.idDrink === drink.idDrink);
  if(i >= 0) state.favs.splice(i,1); else state.favs.unshift(minify(drink));
  dedupeAndCap(); persistFavs(); renderFavs(); updateSaveButtons(); updateSearchSaveButtons();
}

// ================= utilities =================
function ingredientsList(d){
  const list = [];
  for(let i=1;i<=15;i++){
    const ing=d[`strIngredient${i}`], meas=d[`strMeasure${i}`];
    if(ing){ list.push(meas ? `${(meas||"").trim()} ${ing}`.trim() : ing); }
  }
  return list;
}
function copyRecipeText(d){
  return [
    `${d.strDrink}`,
    `${[d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ")}`,
    ``,
    `Ingredients:`, ...ingredientsList(d).map(x=>` - ${x}`),
    ``,
    `Instructions:`, d.strInstructions || "—"
  ].join("\n");
}

// Robust copy (desktop + mobile fallbacks)
async function copyToClipboard(text){
  // Modern API (HTTPS + user gesture)
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); statusEl.textContent = "Copied to clipboard."; return; }
    catch { /* fall through */ }
  }
  // Legacy fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    statusEl.textContent = "Copied to clipboard.";
  } catch {
    // Last resort: show prompt so user can copy manually
    alert("Copy not available. The recipe text will be shown so you can copy manually.\n\n" + text);
  } finally {
    document.body.removeChild(ta);
  }
}

// ================= RANDOM MODE =================
const cardEl  = $("#card");
const imgEl   = $("#thumb");
const titleEl = $("#title");
const metaEl  = $("#meta");
const ingList = $("#ingredients");
const instrEl = $("#instructions");

$("#newBtn").addEventListener("click", loadRandom);
$("#saveBtn").addEventListener("click", () => state.current && toggleSave(state.current));
$("#copyBtn").addEventListener("click", () => state.current && copyToClipboard(copyRecipeText(state.current)));
$("#shareBtn").addEventListener("click", shareCurrent);
$("#printBtn").addEventListener("click", () => printSmart(state.current));

updateSaveButtons();

async function loadRandom(){
  setBusy(true, "Loading a delicious idea…");
  cardEl.hidden = true;
  try{
    const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const d    = data.drinks?.[0]; if(!d) throw new Error("No drink");
    setCurrent(d);
    renderRandomCard(d);
    statusEl.textContent = "Press “New Drink” to shuffle again.";
  }catch(err){
    console.error(err);
    statusEl.textContent = "Couldn’t load a drink. Please try again.";
  }finally{
    setBusy(false);
  }
}

function renderRandomCard(d){
  imgEl.src = d.strDrinkThumb; imgEl.alt = d.strDrink || "Drink";
  titleEl.textContent = d.strDrink || "—";
  metaEl.textContent  = [d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ");
  instrEl.textContent = d.strInstructions || "—";
  ingList.innerHTML = "";
  for(const item of ingredientsList(d)){
    const li = document.createElement("li"); li.textContent = item; ingList.appendChild(li);
  }
  cardEl.hidden = false;
  setCurrent(d);
}

function updateSaveButtons(){
  const saved = state.current && isSaved(state.current.idDrink);
  const label = saved ? "⭐ Saved" : "⭐ Save";
  $("#saveBtn").textContent = label;
  const dlgBtn = $("#dSaveBtn");
  if (dlgBtn) dlgBtn.textContent = label;
}

// ================= SEARCH MODE (with suggestions) =================
const resultsEl   = $("#results");
const searchForm  = $("#searchForm");
const searchInput = $("#searchInput");
const randomBtn   = $("#randomBtn");
const suggestionsEl = $("#suggestions");

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const term = searchInput.value.trim();
  if(!term) return;
  hideSuggestions();
  await doSearch(term);
});
randomBtn.addEventListener("click", async () => {
  const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
  const data = await res.json();
  renderSearchCards(data.drinks ? [data.drinks[0]] : []);
  hideSuggestions();
});

// Debounced suggest-as-you-type
let suggestTimer = null;
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  clearTimeout(suggestTimer);
  if (q.length < 2) { hideSuggestions(); return; }
  suggestTimer = setTimeout(() => fetchSuggestions(q), 220);
});

// keyboard nav in suggestions
searchInput.addEventListener("keydown", (e) => {
  if (suggestionsEl.hidden) return;
  const items = $$("#suggestions li");
  if (!items.length) return;

  const activeIdx = items.findIndex(li => li.classList.contains("active"));

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = (activeIdx + 1) % items.length;
    items.forEach(li => li.classList.remove("active"));
    items[next].classList.add("active");
    items[next].scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const next = (activeIdx - 1 + items.length) % items.length;
    items.forEach(li => li.classList.remove("active"));
    items[next].classList.add("active");
    items[next].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    if (activeIdx >= 0) {
      e.preventDefault();
      const val = items[activeIdx].dataset.name;
      selectSuggestion(val);
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

async function fetchSuggestions(q){
  try{
    const res = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`);
    const data = await res.json();
    const names = (data.drinks || []).map(d => d.strDrink).filter(Boolean);

    if (!names.length) { hideSuggestions(); return; }

    // Unique, top 8
    const unique = [...new Set(names)].slice(0, 8);

    suggestionsEl.innerHTML = "";
    unique.forEach(name => {
      const li = document.createElement("li");
      li.textContent = name;
      li.dataset.name = name;
      li.addEventListener("mousedown", (e) => { // mousedown avoids blur before click on some mobiles
        e.preventDefault();
        selectSuggestion(name);
      });
      suggestionsEl.appendChild(li);
    });
    // mark first as active
    const first = suggestionsEl.querySelector("li");
    if (first) first.classList.add("active");

    suggestionsEl.hidden = false;
  }catch{
    hideSuggestions();
  }
}

function hideSuggestions(){ suggestionsEl.hidden = true; suggestionsEl.innerHTML = ""; }
async function selectSuggestion(name){
  searchInput.value = name;
  hideSuggestions();
  await doSearch(name);
}

async function doSearch(term){
  setBusy(true, `Searching for “${term}”…`);
  try{
    const res  = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderSearchCards(data.drinks || []);
    statusEl.textContent = (data.drinks && data.drinks.length) ? "" : "No results. Try another search.";
  }catch(err){
    console.error(err);
    statusEl.textContent = "Something went wrong. Please try again.";
  }finally{ setBusy(false); }
}

function renderSearchCards(items){
  resultsEl.innerHTML = "";
  if(!items.length){ resultsEl.innerHTML = `<p class="muted">No results.</p>`; return; }

  const frag = document.createDocumentFragment();
  for(const d of items){
    const card = document.createElement("article"); card.className="card-sm";
    card.innerHTML = `
      <img src="${d.strDrinkThumb}" alt="${d.strDrink}"/>
      <div class="pad">
        <h3 class="card-title" style="margin:0 0 .25rem">${d.strDrink}</h3>
        <p class="muted">${[d.strCategory,d.strAlcoholic].filter(Boolean).join(" • ")}</p>
        <div class="inline-actions">
          <button class="btn open">Open</button>
          <button class="btn save" data-id="${d.idDrink}">⭐ Save</button>
        </div>
      </div>
    `;
    $(".open", card).onclick = () => openDetails(d);
    $(".save", card).onclick = () => { toggleSave(d); updateSearchSaveButtons(); };
    frag.appendChild(card);
  }
  resultsEl.appendChild(frag);
  updateSearchSaveButtons();
}

function updateSearchSaveButtons(){
  $$("#results .card-sm .btn.save").forEach(btn => {
    const id = btn.dataset.id;
    btn.textContent = isSaved(id) ? "⭐ Saved" : "⭐ Save";
  });
}

// ---------- Details dialog ----------
const dialogEl = $("#detailsDialog");
$("#closeDialog").addEventListener("click", () => dialogEl.close());
$("#dSaveBtn")?.addEventListener("click", () => state.current && toggleSave(state.current));
$("#dCopyBtn")?.addEventListener("click", () => state.current && copyToClipboard(copyRecipeText(state.current)));
$("#dShareBtn")?.addEventListener("click", shareCurrent);
$("#dPrintBtn")?.addEventListener("click", () => printSmart(state.current));

function openDetails(d){
  setCurrent(d);
  $("#dTitle").textContent = d.strDrink || "—";
  $("#dImg").src = d.strDrinkThumb; $("#dImg").alt = d.strDrink || "Drink";
  $("#dMeta").textContent = [d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ");
  const ul = $("#dIngredients"); ul.innerHTML = "";
  for(const item of ingredientsList(d)){ const li=document.createElement("li"); li.textContent=item; ul.appendChild(li); }
  $("#dInstructions").textContent = d.strInstructions || "—";
  if(typeof dialogEl.showModal === "function") dialogEl.showModal();
  else alert(`Ingredients:\n${ingredientsList(d).join("\n")}\n\n${d.strInstructions||"—"}`);
  updateSaveButtons();
}

function openDrink(f){
  const expanded = {}; (f.ingredients||[]).forEach((v,i)=> expanded[`strIngredient${i+1}`] = v);
  const d = { ...f, ...expanded };
  if(!$("#pane-random").hidden) renderRandomCard(d);
  else openDetails(d);
}

// ---------- Share ----------
async function shareCurrent(){
  if (!state.current) return;
  const d = state.current;
  const title = `${d.strDrink} — Cocktail Finder`;
  const text  = copyRecipeText(d);
  const url   = location.href;

  try{
    if (navigator.share) {
      await navigator.share({ title, text, url });
      statusEl.textContent = "Shared.";
      return;
    }
  }catch(e){
    if (e?.name !== "AbortError") console.warn(e);
  }

  // Fallback: email + copy
  const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + "\n\n" + url)}`;
  try { await navigator.clipboard.writeText(text + "\n\n" + url); } catch {}
  location.href = mailto;
}

// ---------- Smart Print (desktop window / mobile dialog) ----------
const printDialog = $("#printDialog");
$("#pClose").addEventListener("click", () => printDialog.close());
$("#pPrint").addEventListener("click", () => window.print());

function printSmart(d){
  if (!d) return;
  const isSmall = window.matchMedia("(max-width: 768px)").matches;

  if (isSmall) {
    // Fill dialog
    $("#pTitle").textContent = d.strDrink || "Print Preview";
    $("#pMeta").textContent  = [d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ");
    $("#pImg").src = d.strDrinkThumb; $("#pImg").alt = d.strDrink || "Drink";

    const ul = $("#pIngredients"); ul.innerHTML = "";
    for(const item of ingredientsList(d)){
      const li = document.createElement("li"); li.textContent = item; ul.appendChild(li);
    }
    $("#pInstructions").textContent = d.strInstructions || "—";

    if (typeof printDialog.showModal === "function") printDialog.showModal();
    else alert("Print preview not supported by this browser.");
    return;
  }

  // Desktop: open print window (nice printable layout)
  const ings = ingredientsList(d);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${d.strDrink} — Print</title>
<style>
  @page { size: Letter; margin: 14mm; }
  :root{ --ink:#111; --muted:#475569; }
  body{ font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:var(--ink); }
  .sheet{ max-width: 900px; margin: 0 auto; }
  header{text-align:center;margin-bottom:8mm}
  h1{ font:700 28px/1.2 "Playfair Display", Georgia, serif; margin:0 0 2mm; }
  .meta{ color:var(--muted) }
  .grid{ display:grid; grid-template-columns: 320px 1fr; gap:12mm; align-items:start }
  img{ width:100%; border-radius:12px; box-shadow:0 6px 18px rgba(0,0,0,.15) }
  h2{ font:600 16px/1.2 "Playfair Display", Georgia, serif; margin:0 0 4mm }
  ul{ padding-left:1.2em; margin:0 }
  .footer{ margin-top:10mm; text-align:center; color:var(--muted); font-size:12px }
</style></head><body>
<div class="sheet">
<header><h1>${escapeHtml(d.strDrink||"—")}</h1>
<div class="meta">${escapeHtml([d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • "))}</div></header>
<section class="grid">
  <div><img src="${d.strDrinkThumb}" alt="${escapeHtml(d.strDrink||"Drink")}"></div>
  <div>
    <h2>Ingredients</h2>
    <ul>${ings.map(i=>`<li>${escapeHtml(i)}</li>`).join("")}</ul>
    <h2 style="margin-top:6mm">Instructions</h2>
    <p>${escapeHtml(d.strInstructions||"—")}</p>
  </div>
</section>
<p class="footer">Printed from Cocktail Finder • thecocktaildb.com</p>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),50);<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => (
    { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]
  ));
}

// ---------- Toast (undo) ----------
const toastEl    = $("#toast");
const toastMsgEl = $("#toastMsg");
const toastUndo  = $("#toastUndo");
let toastTimer = null;
function hideToast(){
  toastEl.hidden = true;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}
hideToast();
toastEl.addEventListener("click", hideToast);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !toastEl.hidden) hideToast(); });
function showToast(message, onUndo){
  toastMsgEl.textContent = message;
  if (onUndo) { toastUndo.hidden = false; toastUndo.onclick = () => { hideToast(); onUndo(); }; }
  else { toastUndo.hidden = true; toastUndo.onclick = null; }
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2000);
}

// ---------- status helper ----------
function setBusy(_isBusy, text=""){ statusEl.textContent = text || statusEl.textContent; }

// seed with one random
loadRandom();
