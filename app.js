import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

const CATS = [
  ["fruta","Fruta y verdura"],["frescos","Carne y pescado"],["lacteos","Lácteos y huevos"],
  ["pan","Pan"],["despensa","Despensa"],["congelados","Congelados"],["bebidas","Bebidas"],
  ["limpieza","Limpieza y hogar"],["higiene","Higiene"],["otros","Otros"]
];
const CAT_NAME = Object.fromEntries(CATS);
// Rough guess of the aisle from the words typed; the person can always tap another chip.
const GUESS = {
  fruta:"manzana plátano platano naranja limón limon pera fresa uva melón melon sandía sandia kiwi aguacate tomate lechuga cebolla ajo patata zanahoria pimiento pepino calabacín calabacin berenjena espinaca brócoli brocoli fruta verdura champiñón champiñones puerro",
  frescos:"pollo carne ternera cerdo filete filetes pescado merluza salmón salmon gambas jamón jamon pavo chorizo lomo hamburguesas salchichas embutido",
  lacteos:"leche yogur yogures queso mantequilla nata huevo huevos",
  pan:"pan barra baguette tostadas bollos magdalenas",
  despensa:"arroz pasta macarrones espaguetis aceite sal azúcar azucar harina lentejas garbanzos legumbres café cafe cacao galletas cereales conservas frito atún atun especias vinagre miel mermelada",
  congelados:"helado helados congelado congelada pizza guisantes",
  bebidas:"agua zumo refresco refrescos cerveza vino coca",
  limpieza:"detergente suavizante lejía lejia friegasuelos lavavajillas estropajo bolsas servilletas papel cocina fregona",
  higiene:"champú champu gel dientes desodorante compresas pañales panales jabón jabon higiénico higienico cepillo"
};
const WORD2CAT = {};
for (const [c, w] of Object.entries(GUESS)) w.split(" ").forEach(x => WORD2CAT[x] = c);
function guessCat(s){
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  // Also try the singular: "tomates" -> "tomate", "limones" -> "limon".
  for (const w of words) for (const f of [w, w.replace(/s$/, ""), w.replace(/es$/, "")]) if (WORD2CAT[f]) return WORD2CAT[f];
  return null;
}

const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} }
};
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

let fs, db, listId, me, items = [], selCat = "otros", catLocked = false, unsub = null;
const busy = new Set();

// ---------- list key: a long random id that works as the shared secret ----------
const KEY_RE = /^[A-Za-z0-9]{20,40}$/;
function newKey(){
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(r, b => abc[b % abc.length]).join("");
}
function keyFrom(text){
  const t = (text || "").trim();
  const m = t.match(/#?([A-Za-z0-9]{20,40})\s*$/);
  return m ? m[1] : null;
}
function shareLink(){ return location.origin + location.pathname + "#" + listId; }

// ---------- small UI helpers ----------
let toastT;
function toast(msg, actionLabel, action){
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  if (actionLabel) {
    const b = document.createElement("button"); b.type = "button"; b.className = "toast-act"; b.textContent = actionLabel;
    b.onclick = () => { t.hidden = true; action(); };
    t.append(b);
  }
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, actionLabel ? 6000 : 2600);
}
function show(id){ for (const s of ["setup","join","who","app"]) $(s).hidden = s !== id; }
function failMsg(e){
  if (e && e.code === "permission-denied") return "No se pudo guardar: el enlace de la lista no es válido.";
  return "No se pudo guardar. Revisa la conexión y prueba otra vez.";
}

// ---------- category chips ----------
function drawCats(){
  $("cats").replaceChildren(...CATS.map(([k, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = label;
    b.setAttribute("aria-pressed", String(k === selCat));
    b.onclick = () => { selCat = k; catLocked = true; drawCats(); };
    return b;
  }));
}
$("name").addEventListener("input", e => {
  if (catLocked) return;
  const g = guessCat(e.target.value) || "otros";
  if (g !== selCat) {
    selCat = g; drawCats();
    const on = $("cats").querySelector('[aria-pressed="true"]');
    if (on) $("cats").scrollLeft = on.offsetLeft - $("cats").offsetLeft - 8;
  }
});

// ---------- rendering ----------
function render(){
  const pending = items.filter(i => !i.bought);
  const bought = items.filter(i => i.bought).sort((a,b) => (b.boughtAt||0) - (a.boughtAt||0));

  const b = document.createElement("b"); b.textContent = pending.length;
  $("count").replaceChildren(b, " por comprar");

  const P = $("pending"); P.replaceChildren();
  if (!pending.length) {
    const e = document.createElement("div"); e.className = "empty";
    const s = document.createElement("strong"); s.textContent = "No falta nada";
    e.append(s, bought.length ? "Todo está en el carro. Cuando termines, vacía los comprados." : "Escribe arriba lo que haga falta y aparecerá aquí para toda la familia.");
    P.append(e);
  } else {
    const wrap = document.createElement("div"); wrap.style.cssText = "display:flex;flex-direction:column;gap:18px";
    for (const [k, label] of CATS) {
      const list = pending.filter(i => (CAT_NAME[i.cat] ? i.cat : "otros") === k).sort((a,b) => (a.addedAt||0) - (b.addedAt||0));
      if (!list.length) continue;
      const g = document.createElement("div"); g.className = "group";
      const h = document.createElement("h2"); h.textContent = label;
      const ul = document.createElement("ul"); list.forEach(i => ul.append(row(i)));
      g.append(h, ul); wrap.append(g);
    }
    P.append(wrap);
  }

  const C = $("cart"); C.replaceChildren(); C.hidden = !bought.length;
  if (bought.length) {
    const g = document.createElement("div"); g.className = "group";
    const head = document.createElement("div"); head.className = "cart-head";
    const h = document.createElement("h2"); h.textContent = "En el carro · " + bought.length;
    const btn = document.createElement("button"); btn.className = "btn clear"; btn.id = "clearBtn"; btn.type = "button";
    const armed = Date.now() < armedUntil;
    btn.classList.toggle("armed", armed);
    btn.textContent = armed ? "Pulsa otra vez para vaciar " + bought.length : "Vaciar comprados";
    btn.onclick = clearBought;
    head.append(h, btn);
    const ul = document.createElement("ul"); bought.forEach(i => ul.append(row(i)));
    g.append(head, ul); C.append(g);
  }
}

function row(i){
  const li = document.createElement("li"); li.dataset.id = i.id;
  if (i.bought) li.className = "done";
  const t = document.createElement("button"); t.className = "tick"; t.type = "button"; t.innerHTML = CHECK;
  t.setAttribute("aria-label", (i.bought ? "Desmarcar " : "Marcar como comprado: ") + i.name);
  t.onclick = () => toggle(i);
  const txt = document.createElement("div"); txt.className = "txt"; txt.onclick = () => toggle(i);
  const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = i.name;
  if (i.qty) { const q = document.createElement("span"); q.className = "q"; q.textContent = i.qty; nm.append(q); }
  txt.append(nm);
  if (i.addedBy) {
    const by = document.createElement("div"); by.className = "by";
    by.textContent = i.addedBy === me ? "Lo apuntaste tú" : "Lo apuntó " + i.addedBy;
    txt.append(by);
  }
  const d = document.createElement("button"); d.className = "del"; d.type = "button"; d.textContent = "×";
  d.setAttribute("aria-label", "Quitar " + i.name + " de la lista");
  d.onclick = () => remove(i);
  li.append(t, txt, d);
  return li;
}

// ---------- writes ----------
// Writes are not awaited before updating the screen: Firestore shows them at once
// and sends them when there is signal, so the list keeps working inside the supermarket.
const itemsCol = () => fs.collection(db, "lists", listId, "items");
const itemRef = id => fs.doc(db, "lists", listId, "items", id);

function toggle(i){
  if (busy.has(i.id)) return;
  busy.add(i.id);
  fs.updateDoc(itemRef(i.id), i.bought
    ? { bought:false, boughtBy:"", boughtAt:0 }
    : { bought:true, boughtBy:me, boughtAt:Date.now() })
    .catch(e => toast(e && e.code === "not-found" ? "Ese producto ya no está en la lista." : failMsg(e)));
  setTimeout(() => busy.delete(i.id), 400);
}
function remove(i){
  const { id, ...body } = i;
  fs.deleteDoc(itemRef(id)).catch(e => toast(failMsg(e)));
  toast("Quitado: " + i.name, "Deshacer", () => fs.setDoc(itemRef(id), body).catch(e => toast(failMsg(e))));
}
let armedUntil = 0, armT;
function clearBought(){
  if (Date.now() > armedUntil) {
    armedUntil = Date.now() + 4000;
    clearTimeout(armT); armT = setTimeout(render, 4100);
    render();
    return;
  }
  armedUntil = 0; clearTimeout(armT);
  const bought = items.filter(i => i.bought);
  const batch = fs.writeBatch(db);
  bought.slice(0, 450).forEach(i => batch.delete(itemRef(i.id)));
  batch.commit().catch(e => toast(failMsg(e)));
  toast("Lista limpia. ¡Gracias por hacer la compra!");
}

$("addForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("name").value.trim().replace(/\s+/g, " ");
  const qty = $("qty").value.trim();
  if (!name) return;
  const dup = items.find(i => !i.bought && i.name.toLowerCase() === name.toLowerCase());
  if (dup) {
    const li = document.querySelector('li[data-id="' + dup.id + '"]');
    if (li) { li.classList.remove("flash"); void li.offsetWidth; li.classList.add("flash"); li.scrollIntoView({block:"center", behavior:"smooth"}); }
    toast(dup.name + " ya está en la lista");
    return;
  }
  fs.addDoc(itemsCol(), {
    name: name[0].toUpperCase() + name.slice(1), qty, cat: selCat,
    addedBy: me, addedAt: Date.now(), bought:false, boughtBy:"", boughtAt:0
  }).catch(err => toast(failMsg(err)));
  $("name").value = ""; $("qty").value = ""; catLocked = false; selCat = "otros"; drawCats(); $("name").focus();
});

// ---------- invite ----------
$("inviteBtn").onclick = () => { $("shareUrl").textContent = shareLink(); $("invite").hidden = false; };
$("closeInvite").onclick = () => $("invite").hidden = true;
$("copyBtn").onclick = async () => {
  try { await navigator.clipboard.writeText(shareLink()); toast("Enlace copiado"); }
  catch { getSelection().selectAllChildren($("shareUrl")); toast("Mantén pulsado el enlace para copiarlo"); }
};
$("shareBtn").onclick = async () => {
  const text = "Nuestra lista de la compra. Ábrela y añádela a tu pantalla de inicio:";
  if (navigator.share) {
    try { await navigator.share({ title: "La compra", text, url: shareLink() }); } catch {}
  } else {
    location.href = "https://wa.me/?text=" + encodeURIComponent(text + " " + shareLink());
  }
};

// ---------- connection state ----------
function onlineState(){ $("offline").hidden = navigator.onLine; }
addEventListener("online", onlineState); addEventListener("offline", onlineState);

// ---------- boot ----------
function openList(key){
  listId = key; store.set("listId", key);
  if (location.hash.slice(1) !== key) history.replaceState(null, "", "#" + key);
  me = store.get("me");
  if (!me) { show("who"); $("whoInput").focus(); return; }
  $("me").textContent = "Hola, " + me + " ·";
  show("app"); drawCats(); onlineState();
  $("count").textContent = "Cargando…";
  if (unsub) unsub();
  unsub = fs.onSnapshot(itemsCol(), snap => {
    items = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(i => typeof i.name === "string" && i.name);
    render();
  }, err => {
    $("count").textContent = "";
    toast(err && err.code === "permission-denied" ? "No se puede abrir esta lista. Revisa el enlace." : "Se perdió la conexión con la lista. Vuelve a abrir la app.");
  });
}

$("whoForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("whoInput").value.trim().slice(0, 30);
  if (!v) return;
  store.set("me", v); openList(listId);
});
$("me").addEventListener("click", () => { $("whoInput").value = me; show("who"); });
$("joinBtn").onclick = () => {
  const k = keyFrom($("joinInput").value);
  if (!k) { toast("Ese enlace no parece de una lista. Cópialo entero."); return; }
  openList(k);
};
$("createBtn").onclick = () => openList(newKey());
addEventListener("hashchange", () => {
  const k = keyFrom(location.hash);
  if (k && k !== listId && fs) openList(k);
});

async function boot(){
  if (!firebaseConfig.projectId) { show("setup"); return; }
  try {
    const [appMod, fsMod] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js")]);
    fs = fsMod;
    const app = appMod.initializeApp(firebaseConfig);
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch { db = fs.getFirestore(app); }
  } catch {
    $("count").textContent = "";
    toast("No se pudo cargar la app. Comprueba la conexión y vuelve a abrirla.");
    return;
  }
  const k = keyFrom(location.hash) || keyFrom(store.get("listId"));
  if (k) openList(k); else show("join");
}
boot();
