// Range le Carnet dans l'iPhone, dans un fichier carnet.json (sauvegardé par iCloud avec le téléphone),
// avec la même petite interface « db » que la page avait dans Claude (collection / doc / onSnapshot / set / update / delete).
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { DEPART } from "./depart.js";

const FICHIER = "carnet.json", VEILLE = "carnet-veille.json";
const natif = Capacitor.isNativePlatform();
const ou = { directory: Directory?.Documents, encoding: Encoding?.UTF8 };

/* ---------- le fichier ---------- */
async function lireFichier(path) {
  if (!natif) { const t = localStorage.getItem(path); return t ? JSON.parse(t) : null; }
  try { return JSON.parse((await Filesystem.readFile({ path, ...ou })).data); }
  catch { return null; }
}
async function ecrireFichier(path, texte) {
  if (!natif) { localStorage.setItem(path, texte); return; }
  await Filesystem.writeFile({ path, data: texte, ...ou });
}

// Si le fichier du jour est abîmé, on repart de la copie de la veille ; sinon des réglages de départ
let base = (await lireFichier(FICHIER)) || (await lireFichier(VEILLE)) || structuredClone(DEPART);
let copieDu = base.__copieDu || "";

let file = Promise.resolve();
function sauver() {
  const jour = new Date().toISOString().slice(0, 10);
  const copie = copieDu !== jour;
  if (copie) copieDu = base.__copieDu = jour;
  const texte = JSON.stringify(base);
  // Une écriture à la fois, dans l'ordre ; une fois par jour, on garde aussi une copie de secours
  file = file.catch(() => {}).then(async () => {
    if (copie) await ecrireFichier(VEILLE, texte);
    await ecrireFichier(FICHIER, texte);
  });
  return file;
}

/* ---------- la même interface que dans Claude ---------- */
const coupe = path => { const i = path.lastIndexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };
const table = col => (base[col] ||= {});
const vue = (id, v) => ({ id, exists: v !== undefined, data: () => (v === undefined ? undefined : structuredClone(v)) });
const ecoutes = new Set();
const prevenir = col => queueMicrotask(() => { for (const e of ecoutes) if (e.col === col) e.envoyer(); });
const ecouter = (col, envoyer) => { const e = { col, envoyer }; ecoutes.add(e); queueMicrotask(envoyer); return () => ecoutes.delete(e); };
const nouvelId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

function ref(path) {
  const [col, id] = coupe(path);
  return { id, path,
    onSnapshot: cb => ecouter(col, () => cb(vue(id, table(col)[id]))),
    set: async d => { table(col)[id] = structuredClone(d); prevenir(col); await sauver(); },
    update: async d => {
      const v = table(col)[id];
      if (!v) throw Object.assign(new Error("Introuvable"), { code: "not-found" });
      Object.assign(v, structuredClone(d)); prevenir(col); await sauver();
    },
    delete: async () => { delete table(col)[id]; prevenir(col); await sauver(); },
  };
}
function coll(col, tri = null, max = Infinity) {
  const docs = () => {
    let l = Object.entries(table(col));
    if (tri) {
      const [f, sens] = tri, k = sens === "desc" ? -1 : 1;
      l.sort(([, a], [, b]) => (a[f] < b[f] ? -k : a[f] > b[f] ? k : 0));
    }
    return l.slice(0, max).map(([id, v]) => vue(id, v));
  };
  return {
    orderBy: (f, sens) => coll(col, [f, sens], max),
    limit: n => coll(col, tri, n),
    onSnapshot: cb => ecouter(col, () => cb({ docs: docs() })),
    doc: id => ref(col + "/" + (id || nouvelId())),
  };
}
/* ---------- sauvegarde dans un fichier (Réglages → Mes données) ---------- */
window.__carnetSauvegarde = {
  async exporter() {
    const nom = "carnet-dilerna-" + new Date().toISOString().slice(0, 10) + ".json";
    const fichier = new File([JSON.stringify(base)], nom, { type: "application/json" });
    // Sur l'iPhone : la feuille de partage (Enregistrer dans Fichiers, s'envoyer par e-mail…)
    if (navigator.canShare?.({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: "Sauvegarde du Carnet" }); } catch {}
      return;
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(fichier), download: nom });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importer() {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    inp.onchange = async () => {
      let lu;
      try { lu = JSON.parse(await inp.files[0].text()); } catch { alert("Ce fichier n'est pas une sauvegarde du Carnet."); return; }
      if (!lu || typeof lu !== "object" || !(lu.clientes || lu.rdv || lu.reglages)) { alert("Ce fichier n'est pas une sauvegarde du Carnet."); return; }
      const n = Object.keys(lu.clientes || {}).length;
      if (!confirm(`Remplacer tout ton Carnet par cette sauvegarde (${n} cliente${n > 1 ? "s" : ""}) ?`)) return;
      base = lu; await sauver(); location.reload();
    };
    inp.click();
  },
};

window.__ouvrirCarnet(Object.freeze({ collection: p => coll(p), doc: p => ref(p) }));
