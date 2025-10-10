// ---------- tiny DOM helpers ----------
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// ---------- state ----------
const state = { current: null, favs: [] };

// ---------- elements ----------
const statusEl   = $("#status");
const favListEl  = $("#favList");
const favCountEl = $("#favCount");

// dialogs
const shareDlg = $("#shareDialog");
const printDlg = $("#printDialog");
const toastEl  = $("#toast");

// ---------- tabs ----------
const tabs = $$(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
function setTab(name){
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("#pane-random").hidden = name !== "random";
  $("#pane-search").hidden = name !== "search";
  status("");                    // clear status
  // keep the Save button reflecting what’s on screen
  updateSaveButtons();
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
      // if we removed the one on screen, reflect it
      if (state.current && state.current.idDrink === btn.dataset.id) updateSaveButtons();
      updateSearchSaveButtons();
      showToast("Removed 1 saved drink.");
    });
  });

  // wire clear all
  $("#clearFavs")?.addEventListener("click", () => {
    if (!state.favs.length) return;
    state.favs = [];
    persistFavs();
    renderFavs();
    updateSaveButtons();
    updateSearchSaveButtons();
    showToast("Removed all saved drinks.");
  }, { once:true });
}

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
  showToast(i >= 0 ? "Removed from favorites." : "Saved to favorites.");
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

// robust clipboard (works on iOS Safari too)
async function copyText(text){
  try{
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    showToast("Copied to clipboard.");
  }catch{
    status("Unable to copy. You can select and copy manually.");
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
$("#copyBtn").addEventListener("click", () => state.current && copyText(copyRecipeText(state.current)));
$("#shareBtn").addEventListener("click", () => state.current && shareCurrent(state.current));
$("#printBtn").addEventListener("click", () => state.current && printCurrent(state.current));

async function loadRandom(){
  status("Loading a delicious idea…");
  cardEl.hidden = true;
  try{
    const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const d    = data.drinks?.[0]; if(!d) throw new Error("No drink");
    renderRandomCard(d);
    status("Press “New Drink” to shuffle again.");
  }catch(err){
    console.error(err);
    status("Couldn’t load a drink. Please try again.");
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
  const mainBtn = $("#saveBtn");
  const dlgBtn  = $("#dSaveBtn");
  const label   = saved ? "⭐ Saved" : "⭐ Save";
  if (mainBtn) mainBtn.textContent = label;
  if (dlgBtn)  dlgBtn.textContent  = label;
}

// ================= SEARCH MODE =================
const resultsEl  = $("#results");
const searchForm = $("#searchForm");
const searchInput= $("#searchInput");
const randomBtn  = $("#randomBtn");
const datalist   = $("#nameSuggestions");

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const term = searchInput.value.trim(); if(!term) return;
  await doSearch(term);
});
randomBtn.addEventListener("click", async () => {
  const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
  const data = await res.json();
  renderSearchCards(data.drinks ? [data.drinks[0]] : []);
});

// typeahead using first-letter endpoint (lightweight)
searchInput.addEventListener("input", async (e) => {
  const v = e.target.value.trim();
  if (!v) { datalist.innerHTML=""; return; }
  try{
    const res  = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(v)}`);
    const data = await res.json();
    const items = (data.drinks||[]).slice(0,12);
    datalist.innerHTML = items.map(d => `<option value="${d.strDrink}"></option>`).join("");
  }catch{}
});

async function doSearch(term){
  status(`Searching for “${term}”…`);
  try{
    const res  = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderSearchCards(data.drinks || []);
    status((data.drinks && data.drinks.length) ? "" : "No results. Try another search.");
  }catch(err){
    console.error(err);
    status("Something went wrong. Please try again.");
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

// ---------- Details dialog ----------
const dialogEl = $("#detailsDialog");
$("#closeDialog").addEventListener("click", () => dialogEl.close());
$("#dSaveBtn").addEventListener("click", () => state.current && toggleSave(state.current));
$("#dCopyBtn").addEventListener("click", () => state.current && copyText(copyRecipeText(state.current)));
$("#dShareBtn").addEventListener("click", () => state.current && shareCurrent(state.current));
$("#dPrintBtn").addEventListener("click", () => state.current && printCurrent(state.current));

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
  if(!$("#pane-random").hidden){
    renderRandomCard(d);
  }else{
    openDetails(d);
  }
}

// ---------- Deep links ----------
(async function handleDeepLink(){
  const id = new URL(location.href).searchParams.get("id");
  if (!id) return;
  try{
    const res = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`);
    const data = await res.json();
    const d = data.drinks?.[0];
    if (d){
      setTab("random");
      renderRandomCard(d);
      // scroll to card
      cardEl.scrollIntoView({ behavior:"smooth", block:"start" });
    }
  }catch(err){ console.warn("Deep link failed", err); }
})();

// ---------- Share ----------
function shareUrlFor(d){
  const url = new URL(location.href);
  url.searchParams.set("id", d.idDrink);   // ensure deep link
  return url.toString();
}

$("#shareClose")?.addEventListener("click", ()=> shareDlg.close());
$("#shareCopy")?.addEventListener("click", async ()=>{
  if (!state.current) return;
  await copyText(shareUrlFor(state.current));
  shareDlg.close();
});
$("#shareEmail")?.addEventListener("click", ()=>{
  if (!state.current) return;
  const d = state.current;
  const title = `${d.strDrink} — Cocktail Finder`;
  const body = copyRecipeText(d) + `\n\n${shareUrlFor(d)}`;
  location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  shareDlg.close();
});

async function shareCurrent(d){
  const url   = shareUrlFor(d);
  const text  = copyRecipeText(d);
  const title = `${d.strDrink} — Cocktail Finder`;

  // try native share first
  try{
    if (navigator.share){
      await navigator.share({ title, text, url });
      showToast("Shared.");
      return;
    }
  }catch(e){
    if (e?.name !== "AbortError") console.warn(e);
  }

  // our fallback dialog
  $("#sharePreview").textContent = url;
  if (typeof shareDlg.showModal === "function") shareDlg.showModal();
  else { await copyText(url); status("Link copied. Share anywhere."); }
}

// ---------- Print ----------
$("#pClose")?.addEventListener("click", ()=> printDlg.close());
$("#pPrint")?.addEventListener("click", ()=>{
  // open an isolated printable window (has its own back/close in the browser UI)
  const d = state.current; if(!d) return;
  const ings = ingredientsList(d);
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${d.strDrink} — Print</title>
  <style>
    @page{size:Letter;margin:14mm}
    body{font:14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;color:#111}
    .sheet{max-width:900px;margin:0 auto}
    h1{font:700 28px/1.2 "Playfair Display",Georgia,serif;margin:0 0 6px}
    .meta{color:#475569;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:320px 1fr;gap:12mm;align-items:start}
    img{width:100%;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.15)}
    .box{background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:6mm}
    @media (max-width:620px){.grid{grid-template-columns:1fr}}
  </style></head><body>
  <div class="sheet">
    <h1>${escapeHtml(d.strDrink||"")}</h1>
    <div class="meta">${escapeHtml([d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • "))}</div>
    <div class="grid">
      <img src="${d.strDrinkThumb}" alt="${escapeHtml(d.strDrink||"Drink")}">
      <div class="box">
        <h2>Ingredients</h2>
        <ul>${ings.map(i=>`<li>${escapeHtml(i)}</li>`).join("")}</ul>
        <h2>Instructions</h2>
        <p>${escapeHtml(d.strInstructions||"—")}</p>
      </div>
    </div>
    <p style="text-align:center;color:#64748b;margin-top:10mm">Printed from Cocktail Finder</p>
  </div>
  <script>onload=()=>setTimeout(()=>print(),50)<\/script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html); w.document.close();
});

function printCurrent(d){
  // show our preview dialog so users have a clear close/print path
  $("#pTitle").textContent = d.strDrink || "Print";
  $("#pMeta").textContent  = [d.strCategory,d.strAlcoholic,d.strGlass].filter(Boolean).join(" • ");
  $("#pImg").src = d.strDrinkThumb; $("#pImg").alt = d.strDrink || "Drink";
  const ul = $("#pIngredients"); ul.innerHTML = ingredientsList(d).map(i=>`<li>${escapeHtml(i)}</li>`).join("");
  $("#pInstructions").textContent = d.strInstructions || "—";
  if (typeof printDlg.showModal === "function") printDlg.showModal();
  else $("#pPrint").click(); // worst-case fallback
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ---------- status + toast ----------
function status(text=""){ statusEl.textContent = text; if(!text) hideToast(); }
let toastTimer;
function showToast(msg, ms=2000){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast(){ toastEl.classList.remove("show"); }

// ---------- seed with one random (or deep link handler above will override) ----------
loadRandom();
