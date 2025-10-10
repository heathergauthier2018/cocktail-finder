// ---------- tiny DOM helpers ----------
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// ---------- Status (auto-clears) ----------
let statusTimer = null;
function setStatus(text) {
  const el = $("#status");
  el.textContent = text || "";
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(() => (el.textContent = ""), 2000);
}

// ---------- Toast (2s, with optional Undo) ----------
let toastTimer = null;
let toastUndoHandler = null;
function showToast(message, withUndo=false, undoHandler=null) {
  const box = $("#toast");
  const msg = $("#toastMsg");
  const undo = $("#toastUndo");

  msg.textContent = message;
  box.removeAttribute("hidden");

  // configure undo
  toastUndoHandler = withUndo && typeof undoHandler === "function" ? undoHandler : null;
  undo.style.display = toastUndoHandler ? "inline-block" : "none";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2000);
}
function hideToast(){
  const box = $("#toast");
  box.setAttribute("hidden", "");
  clearTimeout(toastTimer);
  toastTimer = null;
  toastUndoHandler = null;
}
$("#toastUndo").addEventListener("click", () => {
  if (toastUndoHandler) toastUndoHandler();
  hideToast();
});

// ---------- state ----------
const state = { current: null, favs: [] };

// ---------- favorites storage ----------
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
  state.favs = state.favs.filter(x => (seen.has(x.idDrink) ? false : (seen.add(x.idDrink), true))).slice(0, 20);
}
function setCurrent(drink){
  state.current = drink || null;
  updateSaveButtons();
}

// ---------- tabs ----------
const tabs = $$(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
function setTab(name){
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("#pane-random").hidden = name !== "random";
  $("#pane-search").hidden = name !== "search";
  setStatus("");
}
setTab("random");

// ---------- favorites UI ----------
const favListEl  = $("#favList");
const favCountEl = $("#favCount");

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
      openDrink(f); // sets current & opens
    });
  });

  favListEl.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      state.favs = state.favs.filter(x => x.idDrink !== btn.dataset.id);
      persistFavs();
      renderFavs();
      // if current visible drink is the one we removed, fix the button state
      if (state.current && state.current.idDrink === btn.dataset.id) updateSaveButtons();
      updateSearchSaveButtons();
    });
  });
}

let lastFavs = null;
$("#clearFavs").addEventListener("click", () => {
  if (!state.favs.length) return;
  lastFavs = [...state.favs];
  state.favs = [];
  persistFavs();
  renderFavs();
  updateSaveButtons(); // fix Saved/Save label if current drink was in favorites

  showToast(`Removed ${lastFavs.length} saved drink(s).`, true, () => {
    // UNDO
    state.favs = lastFavs;
    lastFavs = null;
    persistFavs();
    renderFavs();
    updateSaveButtons();
  });
});

// ---------- utilities ----------
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
async function copyToClipboard(text){
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard.");
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied to clipboard.");
      return true;
    } catch {
      setStatus("Unable to copy. You can select and copy manually.");
      return false;
    }
  }
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => (
    { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]
  ));
}

// ---------- RANDOM MODE ----------
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
$("#printBtn").addEventListener("click", printCurrent);

function updateSaveButtons(){
  const saved = state.current && isSaved(state.current.idDrink);
  const mainBtn = $("#saveBtn");
  const dlgBtn  = $("#dSaveBtn");
  const label   = saved ? "⭐ Saved" : "⭐ Save";
  if (mainBtn) mainBtn.textContent = label;
  if (dlgBtn)  dlgBtn.textContent  = label;
}

async function loadRandom(){
  setStatus("Loading a delicious idea…");
  cardEl.hidden = true;
  try{
    const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const d    = data.drinks?.[0]; if(!d) throw new Error("No drink");
    setCurrent(d);
    renderRandomCard(d);
    setStatus("Press “New Drink” to shuffle again.");
  }catch(err){
    console.error(err);
    setStatus("Couldn’t load a drink. Please try again.");
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

// ---------- SEARCH MODE ----------
const resultsEl   = $("#results");
const searchForm  = $("#searchForm");
const searchInput = $("#searchInput");
const suggBox     = $("#suggestions");
const randomBtn   = $("#randomBtn");

// submit search
searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const term = searchInput.value.trim(); if(!term) return;
  await doSearch(term);
});

// random in search pane
randomBtn.addEventListener("click", async () => {
  const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
  const data = await res.json();
  renderSearchCards(data.drinks ? [data.drinks[0]] : []);
});

// typeahead suggestions (custom list)
let suggestTimer = null;
let activeIndex = -1;
let currentSuggestions = [];

function clearSuggestions(){ suggBox.innerHTML = ""; suggBox.setAttribute("hidden",""); currentSuggestions = []; activeIndex = -1; }

searchInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  const q = searchInput.value.trim();
  if (!q) { clearSuggestions(); return; }
  suggestTimer = setTimeout(async () => {
    try{
      const resp = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`);
      const data = await resp.json();
      const names = (data.drinks || []).map(d => d.strDrink);
      currentSuggestions = names.slice(0, 8);
      if (!currentSuggestions.length) { clearSuggestions(); return; }

      suggBox.innerHTML = currentSuggestions.map((n,i)=>`<li data-i="${i}">${escapeHtml(n)}</li>`).join("");
      suggBox.removeAttribute("hidden");

      // click select
      $$("li", suggBox).forEach(li => {
        li.addEventListener("click", () => {
          searchInput.value = li.textContent;
          clearSuggestions();
          searchForm.requestSubmit();
        });
      });
    }catch{
      clearSuggestions();
    }
  }, 250);
});

searchInput.addEventListener("keydown", (e) => {
  if (suggBox.hasAttribute("hidden")) return;
  const max = currentSuggestions.length - 1;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(max, activeIndex + 1);
    updateActiveSuggestion();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(0, activeIndex - 1);
    updateActiveSuggestion();
  } else if (e.key === "Enter") {
    if (activeIndex >= 0) {
      e.preventDefault();
      searchInput.value = currentSuggestions[activeIndex];
      clearSuggestions();
      searchForm.requestSubmit();
    }
  } else if (e.key === "Escape") {
    clearSuggestions();
  }
});
function updateActiveSuggestion(){
  $$("li", suggBox).forEach((li,i) => li.classList.toggle("active", i === activeIndex));
}

async function doSearch(term){
  setStatus(`Searching for “${term}”…`);
  clearSuggestions();
  try{
    const res  = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderSearchCards(data.drinks || []);
    setStatus((data.drinks && data.drinks.length) ? "" : "No results. Try another search.");
  }catch(err){
    console.error(err);
    setStatus("Something went wrong. Please try again.");
  }
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

// ---------- details dialog ----------
const dialogEl = $("#detailsDialog");
$("#closeDialog").addEventListener("click", () => dialogEl.close());
$("#dSaveBtn").addEventListener("click", () => state.current && toggleSave(state.current));
$("#dCopyBtn").addEventListener("click", () => state.current && copyToClipboard(copyRecipeText(state.current)));
$("#dShareBtn").addEventListener("click", shareCurrent);
$("#dPrintBtn").addEventListener("click", printCurrent);

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
  // Expand saved -> full drink for random card/details
  const expanded = {}; (f.ingredients||[]).forEach((v,i)=> expanded[`strIngredient${i+1}`] = v);
  const d = { ...f, ...expanded };
  if(!$("#pane-random").hidden){
    renderRandomCard(d);
  }else{
    openDetails(d);
  }
}

// ---------- Share (deep-link) ----------
async function shareCurrent(){
  if (!state.current) return;
  const d = state.current;
  const title = `${d.strDrink} — Cocktail Finder`;
  const text  = copyRecipeText(d);
  const base  = location.origin + location.pathname.replace(/index\.html$/,'');
  const url   = `${base}?id=${encodeURIComponent(d.idDrink)}`;

  try{
    if (navigator.share) {
      await navigator.share({ title, text, url });
      setStatus("Shared.");
      return;
    }
  }catch(e){
    if (e?.name !== "AbortError") console.warn(e);
  }

  // Fallback: copy link+recipe
  await copyToClipboard(`${title}\n${url}\n\n${text}`);
  showToast("Link copied. Share anywhere.");
}

// ---------- Print ----------
const printDialog = $("#printDialog");
const pTitle = $("#pTitle");
const pMeta  = $("#pMeta");
const pImg   = $("#pImg");
const pIng   = $("#pIngredients");
const pInst  = $("#pInstructions");
$("#pClose").addEventListener("click", () => printDialog.close());
$("#pPrint").addEventListener("click", () => {
  printDialog.close();
  // open real printable window
  doPrintWindow();
});

function printCurrent(){
  if (!state.current) return;
  const d = state.current;

  // Show mobile-friendly preview dialog
  pTitle.textContent = d.strDrink || "Print Preview";
  pMeta.textContent  = [d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ");
  pImg.src = d.strDrinkThumb; pImg.alt = d.strDrink || "Drink";

  pIng.innerHTML = ingredientsList(d).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
  pInst.textContent = d.strInstructions || "—";

  if (typeof printDialog.showModal === "function") {
    printDialog.showModal();
  } else {
    // Fallback: print directly
    doPrintWindow();
  }
}

function doPrintWindow(){
  const d = state.current;
  if (!d) return;
  const ings = ingredientsList(d);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${d.strDrink} — Print</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: Letter; margin: 14mm; }
  :root{ --ink:#111; --muted:#475569; }
  body{ font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:var(--ink); }
  .sheet{ max-width:900px; margin:0 auto; }
  header{ text-align:center; margin-bottom:8mm; }
  h1{ font:700 28px/1.2 "Playfair Display", Georgia, serif; margin:0 0 2mm; }
  .meta{ color:var(--muted); }
  .grid{ display:grid; grid-template-columns:min(320px,40%) 1fr; gap:12mm; align-items:start; }
  .photo{ width:100%; border-radius:12px; box-shadow:0 6px 18px rgba(0,0,0,.15); }
  h2{ font:600 16px/1.2 "Playfair Display", Georgia, serif; margin:0 0 4mm; }
  ul{ padding-left:1.2em; margin:0; }
  .ing li{ margin:2mm 0; }
  .box{ background:#fafafa; border:1px solid #e5e7eb; border-radius:10px; padding:6mm; }
  .footer{ margin-top:10mm; text-align:center; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <h1>${escapeHtml(d.strDrink || "—")}</h1>
      <div class="meta">${escapeHtml([d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • "))}</div>
    </header>

    <section class="grid">
      <div>
        <img class="photo" src="${d.strDrinkThumb}" alt="${escapeHtml(d.strDrink || "Drink")}">
      </div>
      <div class="box">
        <h2>Ingredients</h2>
        <ul class="ing">
          ${ings.map(i => `<li>${escapeHtml(i)}</li>`).join("")}
        </ul>
        <h2 style="margin-top:6mm">Instructions</h2>
        <p>${escapeHtml(d.strInstructions || "—")}</p>
      </div>
    </section>

    <p class="footer">Printed from Cocktail Finder • thecocktaildb.com</p>
  </div>
<script>window.onload = () => { setTimeout(() => window.print(), 60); }<\/script>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

// ---------- toggle save ----------
function toggleSave(drink){
  if(!drink) return;
  const i = state.favs.findIndex(x => x.idDrink === drink.idDrink);
  if(i >= 0) state.favs.splice(i,1);
  else state.favs.unshift(minify(drink));
  dedupeAndCap();
  persistFavs();
  renderFavs();
  updateSaveButtons();
  updateSearchSaveButtons();
}

// ---------- Deep link on load (?id=) ----------
async function tryOpenByIdFromURL() {
  const url = new URL(location.href);
  const id = url.searchParams.get("id");
  if (!id) return false;
  try {
    const resp = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`);
    const data = await resp.json();
    const drink = data.drinks?.[0];
    if (!drink) return false;
    setTab("random");
    renderRandomCard(drink);
    return true;
  } catch { return false; }
}

// ---------- seed ----------
(async () => {
  const opened = await tryOpenByIdFromURL();
  if (!opened) await loadRandom();
})();
