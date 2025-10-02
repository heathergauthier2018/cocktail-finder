// ---------- tiny DOM helpers ----------
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// ---------- state ----------
const state = { current: null, favs: [] };

// ---------- common els ----------
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

// ---------- favorites ----------
loadFavs(); renderFavs();

function persistFavs(){
  try { localStorage.setItem("cf:favs", JSON.stringify(state.favs)); } catch {}
}
function loadFavs(){
  try { state.favs = JSON.parse(localStorage.getItem("cf:favs") || "[]"); }
  catch { state.favs = []; }
}
function renderFavs(){
  favListEl.innerHTML = "";
  favCountEl.textContent = String(state.favs.length);
  for(const f of state.favs){
    const li   = document.createElement("li"); li.className="fav-item";
    const img  = document.createElement("img"); img.src=f.strDrinkThumb; img.alt=f.strDrink;
    const name = Object.assign(document.createElement("div"), { className:"grow", textContent:f.strDrink });
    const open = Object.assign(document.createElement("button"), { className:"btn", textContent:"Open" });
    const rm   = Object.assign(document.createElement("button"), { className:"btn", textContent:"Remove" });
    open.onclick = () => openDrink(f);
    rm.onclick   = () => { state.favs = state.favs.filter(x => x.idDrink !== f.idDrink); persistFavs(); renderFavs(); };
    li.append(img, name, open, rm); favListEl.appendChild(li);
  }
}
function toggleSave(drink){
  const i = state.favs.findIndex(x => x.idDrink === drink.idDrink);
  if(i >= 0) state.favs.splice(i,1); else state.favs.unshift(minify(drink));
  const seen = new Set();
  state.favs = state.favs.filter(x => seen.has(x.idDrink) ? false : (seen.add(x.idDrink), true)).slice(0,20);
  persistFavs(); renderFavs(); updateSaveButtons();
}
function minify(d){
  return {
    idDrink:d.idDrink, strDrink:d.strDrink, strDrinkThumb:d.strDrinkThumb,
    strCategory:d.strCategory, strAlcoholic:d.strAlcoholic, strGlass:d.strGlass,
    ingredients: ingredientsList(d), strInstructions:d.strInstructions
  };
}
function openDrink(f){
  const expanded = {}; (f.ingredients||[]).forEach((v,i)=> expanded[`strIngredient${i+1}`] = v);
  const d = { ...f, ...expanded };
  if(!$("#pane-random").hidden) renderRandomCard(d);
  else openDetails(d);
}

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
  try { await navigator.clipboard.writeText(text); statusEl.textContent = "Copied to clipboard."; }
  catch { statusEl.textContent = "Unable to copy. You can select and copy manually."; }
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

updateSaveButtons();

async function loadRandom(){
  setBusy(true, "Loading a delicious idea…");
  cardEl.hidden = true;
  try{
    const res  = await fetch("https://www.thecocktaildb.com/api/json/v1/1/random.php");
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const d    = data.drinks?.[0]; if(!d) throw new Error("No drink");
    state.current = d;
    renderRandomCard(d);
    statusEl.textContent = "Press “New Drink” to shuffle again.";
  }catch(err){
    console.error(err);
    statusEl.textContent = "Couldn’t load a drink. Please try again.";
  }finally{
    setBusy(false); updateSaveButtons();
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
  cardEl.hidden = false; state.current = d; updateSaveButtons();
}

function updateSaveButtons(){
  const saved = state.current && state.favs.some(x => x.idDrink === state.current.idDrink);
  $("#saveBtn").textContent = saved ? "⭐ Saved (click to remove)" : "⭐ Save";
}

// ================= SEARCH MODE =================
const resultsEl  = $("#results");
const searchForm = $("#searchForm");
const searchInput= $("#searchInput");
const randomBtn  = $("#randomBtn");

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
        <h3>${d.strDrink}</h3>
        <p class="muted">${[d.strCategory,d.strAlcoholic].filter(Boolean).join(" • ")}</p>
        <div class="inline-actions">
          <button class="btn open">Open</button>
          <button class="btn save">⭐ Save</button>
        </div>
      </div>
    `;
    $(".open", card).onclick = () => openDetails(d);
    $(".save", card).onclick = () => { toggleSave(d); };
    frag.appendChild(card);
  }
  resultsEl.appendChild(frag);
}

// ---------- Details dialog ----------
const dialogEl = $("#detailsDialog");
$("#closeDialog").addEventListener("click", () => dialogEl.close());
$("#dSaveBtn").addEventListener("click", () => state.current && toggleSave(state.current));
$("#dCopyBtn").addEventListener("click", () => state.current && copyToClipboard(copyRecipeText(state.current)));

function openDetails(d){
  state.current = d;
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

// ---------- status helper ----------
function setBusy(_isBusy, text=""){ statusEl.textContent = text || statusEl.textContent; }

// seed with one random
loadRandom();
