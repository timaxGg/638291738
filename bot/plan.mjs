// Der Wachmann für „Mein Anlageplan“: läuft auf GitHub alle 5 Minuten.
// - Telegram-Befehle beantworten
// - zu Börsenzeiten alle 30 Min. Kurse prüfen (Hinweise bei starken Bewegungen)
// - nach US-Börsenschluss einmal täglich: Signale, Plan-Regeln, Aufträge mit Stückzahlen
import fs from "node:fs";
import {execSync} from "node:child_process";
import {verschluesseln, entschluesseln} from "./krypto.mjs";
import {UNIVERSUM, EXTRA, ISIN, ART, SPY, STOXX, GOLD, GELD, EURUSD, EURCHF, waehrung} from "./universum.mjs";
import * as ST from "./strategie.mjs";

const E = process.env, TG = E.TELEGRAM_TOKEN || "", CHAT = String(E.TELEGRAM_CHAT || ""), PASS = E.SYNC_PASSWORD || "";
const ROOT = E.ROOT || ".", P = f => `${ROOT}/${f}`, DRY = E.DRY === "1", FORCE = E.FORCE === "1";
const APP = (E.APP_URL || (E.GITHUB_REPOSITORY ? `https://${E.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${E.GITHUB_REPOSITORY.split("/")[1]}/` : "")).replace(/\/?$/, "/");
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")) } catch (e) { return d } };
const writeJSON = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ""), {recursive: true}); fs.writeFileSync(f, JSON.stringify(o)) };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]));
const eur = v => (+v).toLocaleString("de-DE", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " €";
const NAME = Object.fromEntries([...UNIVERSUM.map(u => [u[0], {n: u[1], sec: u[2], reg: u[3], isin: ISIN[u[0]], art: "Aktie"}]), ...Object.entries(EXTRA).map(([s, x]) => [s, {n: x[0], sec: x[1], reg: x[2], isin: x[3], art: ART[s]}])]);
const nm = s => (NAME[s] || {n: s}).n;
const VERSION = 5; // erhöhen, wenn plan.json neue Felder bekommt → sofort neu berechnen
const ZUSATZ = "🧪 <i>Zusatz-Hinweis – nicht im 20-Jahres-Test geprüft</i>";

function zeit(d = new Date(), tz = "Europe/Berlin") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"}).formatToParts(d).map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, wd: p.weekday};
}

/* ---------- Dateien ---------- */
const SF = P("data/plan-state.json"), PF = P("data/plan.json"), DF = P("data/depot.enc"), BF = P(".state/plan-bot.json");
const Z = readJSON(SF, {v: 1, log: [], hints: {}});
const B = readJSON(BF, {offset: 0, q: {}});
const PLAN = readJSON(PF, {});
const MF = P("data/stumm.json"); let STUMM = readJSON(MF, {top: false, plan: false}), stummGeaendert = false, imBefehl = false;
export const stumm = app => !!STUMM[app];
let DEPOT = null, depotGeaendert = false, planGeaendert = false, stateGeaendert = false;

async function depotLaden() {
  if (!PASS || !fs.existsSync(DF)) return DEPOT = {cash: 0, pos: {}, updatedAt: 0};
  try { DEPOT = await entschluesseln(fs.readFileSync(DF, "utf8"), PASS) } catch (e) { log("Depot nicht lesbar:", e.message); DEPOT = null }
  return DEPOT;
}
async function depotSpeichern() {
  if (!PASS || !DEPOT || DRY) return;
  DEPOT.updatedAt = Date.now(); DEPOT.von = "bot";
  fs.writeFileSync(DF, await verschluesseln(DEPOT, PASS)); depotGeaendert = true;
}

/* ---------- Kurse (Yahoo) ---------- */
async function yahoo(s, range = "2y") {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d&events=div`, {headers: {"user-agent": "Mozilla/5.0 (compatible; Anlageplan/1.0)"}});
      if (!r.ok) continue;
      const j = await r.json(), x = j.chart && j.chart.result && j.chart.result[0]; if (!x || !x.timestamp) continue;
      const tz = x.meta.exchangeTimezoneName || "America/New_York", q = x.indicators.quote[0], a = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
      const d = [], c = [], ad = [];
      x.timestamp.forEach((t, i) => { if (q.close[i] == null) return; d.push(zeit(new Date(t * 1000), tz).date); c.push(q.close[i]); ad.push(a[i] ?? q.close[i]) });
      return {d, c, a: ad, live: x.meta.regularMarketPrice, prev: x.meta.chartPreviousClose, cur: x.meta.currency};
    } catch (e) { }
  }
  return null;
}
async function alleKurse(syms, range) {
  const out = {}, liste = [...syms]; let i = 0;
  await Promise.all(Array.from({length: 5}, async () => { while (i < liste.length) { const s = liste[i++]; out[s] = await yahoo(s, range); if (!out[s]) { await sleep(1500); out[s] = await yahoo(s, range) } } }));
  return out;
}
function fxMap(h) { const m = {}; if (h) h.d.forEach((d, i) => m[d] = h.c[i]); return m; }
function euroPreis(s, p, fx) { const w = waehrung(s); return w === "USD" ? p / fx.USD : w === "CHF" ? p / fx.CHF : p; }

/* ---------- Telegram ---------- */
async function tg(method, body) {
  if (!TG || DRY) { if (DRY && method === "sendMessage") log("TG>", body.text); return null }
  try { const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}); return r.json() } catch (e) { log("Telegram:", e.message); return null }
}
async function send(text, knoepfe) {
  if (!CHAT && !DRY) return;
  if (STUMM.plan && !imBefehl) { log("stumm (Anlageplan):", text.slice(0, 60)); return }
  const body = {chat_id: CHAT, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true};
  if (knoepfe) body.reply_markup = {inline_keyboard: knoepfe};
  const r = await tg("sendMessage", body); if (r && !r.ok) log("Telegram-Fehler:", r.description);
}
const link = (route, t = "In der App öffnen") => APP ? `\n<a href="${APP}#${route}">${t} ›</a>` : "";

/* ---------- Texte ---------- */
function signalText(s = PLAN.signale) {
  if (!s) return "Noch keine Daten.";
  const ab = (s.spy / s.spySma - 1) * 100;
  return `S&amp;P 500: ${ST.f2(s.spy)} | 200-Tage-Linie ${ST.f2(s.spySma)} (${ab >= 0 ? "+" : ""}${ST.f1(ab)} %)\n` +
    `Schwankung 21 Tage: ${ST.f1(s.vol)} %\nSTOXX 600: ${s.stoxx > s.stoxxSma ? "über" : "unter"} Linie · Gold: ${s.gold > s.goldSma ? "über" : "unter"} Linie`;
}
function auftragText(o) {
  if (!o || !o.liste || !o.liste.length) return "Keine Aufträge offen.";
  return o.liste.map(x => `${x.act === "kauf" ? "🟢 KAUF" : "🔴 VERKAUF"} ${x.n} × ${esc(nm(x.s))} ≈ ${eur(x.eur)}\n    ${(NAME[x.s] || {}).art || "Aktie"} · ISIN <code>${(NAME[x.s] || {}).isin || x.s}</code>`).join("\n") +
    `\n\nIn Trade Republic: Lupe → ISIN einfügen. Am nächsten Handelstag zur Eröffnung ausführen.`;
}
function statusText() {
  const w = PLAN.ziel || {};
  const zl = Object.entries(w).sort((a, b) => b[1] - a[1]).map(([s, v]) => `• ${esc(nm(s))}: ${(v * 100).toFixed(1).replace(".", ",")} %`).join("\n");
  return `📊 <b>Mein Anlageplan</b> (Stand ${PLAN.asOf || "–"})\n\n<b>Modus:</b> ${ST.MODUS[Z.mode] || "–"}${Z.mode === "U" ? ` · ${Z.expo} % investiert · ${Z.gold} % Gold` : ""}\n\n${signalText()}\n\n<b>Ziel-Aufteilung:</b>\n${zl}${link("status")}`;
}
function depotText() {
  if (!DEPOT) return "Depot nicht lesbar (Sync-Passwort prüfen).";
  const pr = PLAN.preise || {}; let g = +DEPOT.cash || 0; const z = [];
  for (const [s, x] of Object.entries(DEPOT.pos || {})) { const p = (pr[s] || {}).eur || x.p, v = x.n * p; g += v; z.push([s, x, v, p]) }
  if (!z.length && !DEPOT.cash) return "Depot ist leer. Trage in der App oder mit /bargeld 5000 dein Geld ein.";
  return `💼 <b>Depot</b>: ${eur(g)}\n` + z.sort((a, b) => b[2] - a[2]).map(([s, x, v, p]) => `• ${esc(nm(s))}: ${x.n} St. = ${eur(v)} (${(v / g * 100).toFixed(1).replace(".", ",")} %, ${p >= x.p ? "+" : ""}${((p / x.p - 1) * 100).toFixed(1).replace(".", ",")} %)`).join("\n") + `\n• Bargeld: ${eur(DEPOT.cash || 0)}`;
}

/* ---------- Befehle ---------- */
const HILFE = `🤖 <b>Befehle</b>
/status – Modus, Signale, Ziel-Aufteilung
/auftrag – offene Kauf-/Verkaufsaufträge
/erledigt – offene Aufträge ins Depot übernehmen
/depot – mein Depot
/liste – aktuelle Rangliste (Top 15)
/bargeld 5000 – Bargeld setzen
/kauf AAPL 3 210.5 – Kauf eintragen (Preis in €)
/verkauf AAPL 3 220 – Verkauf eintragen
/stumm – Benachrichtigungen je App an/aus (z. B. /stumm top, /an top)
/hilfe – diese Hilfe

Top-Aktien: /beste · /warum · /signale`;
const MEINE = ["/stumm", "/an", "/start", "/hilfe", "/help", "/status", "/plan", "/auftrag", "/depot", "/liste", "/erledigt", "/bargeld", "/kauf", "/verkauf"];
export async function befehl(text) {
  const c = String(text || "").trim().split(/\s+/)[0].toLowerCase().replace(/@.*/, "");
  if (!MEINE.includes(c)) return false;
  if (!geladen) await laden();
  imBefehl = true; try { await befehlIntern(text) } finally { imBefehl = false } return true;
}
function stummKnoepfe() { return [[{text: (STUMM.plan ? "🔕" : "🔔") + " Anlageplan", callback_data: "stumm:plan"}, {text: (STUMM.top ? "🔕" : "🔔") + " Top-Aktien", callback_data: "stumm:top"}]] }
const stummText = () => `🔔 <b>Benachrichtigungen</b>\nAnlageplan: ${STUMM.plan ? "🔕 stumm" : "🔔 an"}\nTop-Aktien: ${STUMM.top ? "🔕 stumm" : "🔔 an"}\n\nAntippen zum Umschalten. Antworten auf Befehle kommen immer.`;
function stummSetzen(app, wert) { STUMM[app] = wert; STUMM.geaendert = new Date().toISOString(); if (!DRY) writeJSON(MF, STUMM); stummGeaendert = true }
export async function knopf(cb) {
  const d = String(cb.data || "");
  if (d.startsWith("stumm:")) {
    const app = d.slice(6); if (!["top", "plan"].includes(app)) return false;
    stummSetzen(app, !STUMM[app]);
    await tg("answerCallbackQuery", {callback_query_id: cb.id, text: (app === "top" ? "Top-Aktien " : "Anlageplan ") + (STUMM[app] ? "stumm" : "an")});
    await tg("editMessageText", {chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML", text: stummText(), reply_markup: {inline_keyboard: stummKnoepfe()}});
    await sichern(); return true;
  }
  if (!d.startsWith("erl:")) return false;
  if (!geladen) await laden();
  imBefehl = true; try { await tg("answerCallbackQuery", {callback_query_id: cb.id}); await erledigt() } finally { imBefehl = false } return true;
}
async function befehlIntern(text) {
  const [c0, ...a] = text.trim().split(/\s+/), c = c0.toLowerCase().replace(/@.*/, "");
  if (c === "/start" || c === "/hilfe" || c === "/help") return send(HILFE);
  if (c === "/stumm" || c === "/an") {
    const w = (a[0] || "").toLowerCase(), app = /top/.test(w) ? "top" : /plan|anlage/.test(w) ? "plan" : null;
    if (app) { stummSetzen(app, c === "/stumm"); await sichern() }
    return send(stummText(), stummKnoepfe());
  }
  if (c === "/plan") return send(statusText());
  if (c === "/status") return send(statusText());
  if (c === "/auftrag") return send(`📝 <b>Offene Aufträge</b>\n\n${auftragText(Z.orders && !Z.orders.done ? Z.orders : null)}`, Z.orders && !Z.orders.done ? [[{text: "✅ Erledigt – ins Depot übernehmen", callback_data: "erl:" + Z.orders.id}]] : null);
  if (c === "/depot") return send(depotText() + link("depot"));
  if (c === "/liste") return send("🏆 <b>Rangliste (12-1 Momentum, in €)</b>\n" + (PLAN.rangliste || []).slice(0, 15).map((r, i) => `${i + 1}. ${r.pick ? "✅" : "▫️"} ${esc(r.n)} ${(r.mom * 100).toFixed(0)} % · ${r.sec}`).join("\n") + "\n✅ = in der Auswahl" + link("liste"));
  if (c === "/erledigt") return erledigt();
  if (!DEPOT) return send("Depot nicht lesbar – ist SYNC_PASSWORD gesetzt?");
  if (c === "/bargeld") { const v = parseFloat((a[0] || "").replace(",", ".")); if (!isFinite(v)) return send("So geht’s: /bargeld 5000"); DEPOT.cash = v; await depotSpeichern(); return send(`Bargeld = ${eur(v)}`) }
  if (c === "/kauf" || c === "/verkauf") {
    const s = (a[0] || "").toUpperCase(), n = parseFloat((a[1] || "").replace(",", ".")); let p = parseFloat((a[2] || "").replace(",", "."));
    const sym = Object.keys(NAME).find(k => k.toUpperCase() === s || k.toUpperCase().split(".")[0] === s);
    if (!sym || !isFinite(n)) return send(`So geht’s: ${c} AAPL 3 210.5`);
    if (!isFinite(p)) p = ((PLAN.preise || {})[sym] || {}).eur; if (!p) return send("Preis fehlt.");
    DEPOT = ST.anwenden(DEPOT, [{s: sym, act: c === "/kauf" ? "kauf" : "verkauf", n, preis: p}]); await depotSpeichern();
    return send(`Eingetragen: ${c === "/kauf" ? "Kauf" : "Verkauf"} ${n} × ${esc(nm(sym))} zu ${eur(p)}`);
  }
  return send("Unbekannter Befehl. /hilfe");
}
async function erledigt() {
  if (!Z.orders || Z.orders.done) return send("Keine offenen Aufträge.");
  if (!DEPOT) return send("Depot nicht lesbar – ist SYNC_PASSWORD gesetzt?");
  DEPOT = Object.assign(ST.anwenden(DEPOT, Z.orders.liste), {erledigt: Z.orders.id}); Z.orders.done = true; if (PLAN.orders) { PLAN.orders.done = true; planGeaendert = true } stateGeaendert = true; await depotSpeichern();
  return send("✅ Aufträge ins Depot übernommen (zu den berechneten Preisen). Passe Abweichungen in der App an." + link("depot"));
}
async function telegram() {
  if (!TG) return;
  const r = await tg("getUpdates", {offset: B.offset, timeout: 0, allowed_updates: ["message", "callback_query"]});
  if (!r || !r.ok) return;
  for (const u of r.result) {
    B.offset = u.update_id + 1;
    try {
      if (u.message && String(u.message.chat.id) === CHAT && u.message.text && !(await befehl(u.message.text))) await send("Unbekannter Befehl. /hilfe");
      if (u.callback_query && String(u.callback_query.message.chat.id) === CHAT) {
        await tg("answerCallbackQuery", {callback_query_id: u.callback_query.id});
        if (String(u.callback_query.data).startsWith("erl:")) await erledigt();
      }
    } catch (e) { log("Befehl-Fehler:", e.message) }
  }
}

/* ---------- Hinweise ---------- */
function hinweis(key, tage, text, art, zusatz) {
  const heute = zeit().date; Z.hints = Z.hints || {};
  if (Z.hints[key] && (new Date(heute) - new Date(Z.hints[key])) / 864e5 < tage) return false;
  Z.hints[key] = heute; stateGeaendert = true;
  PLAN.hinweise = [{d: heute, art, zusatz: !!zusatz, text: text.replace(/<[^>]+>/g, "")}, ...(PLAN.hinweise || [])].slice(0, 30); planGeaendert = true;
  send(text + (zusatz ? "\n\n" + ZUSATZ : ""));
  return true;
}

/* ---------- Täglich nach US-Schluss ---------- */
async function tagesAuswertung() {
  log("Tagesauswertung …");
  const syms = [...UNIVERSUM.map(u => u[0]), SPY, STOXX, GOLD, GELD, EURUSD, EURCHF];
  const R = await alleKurse(syms, "2y");
  if (!R[SPY] || !R[EURUSD]) { log("Keine Kurse für SPY/EURUSD"); return false }
  const fx = {USD: fxMap(R[EURUSD]), CHF: fxMap(R[EURCHF])};
  const H = {};
  for (const s of syms) if (R[s]) H[s] = [SPY, EURUSD, EURCHF].includes(s) ? R[s] : ST.inEuro(s, R[s], fx);
  const fehlend = syms.filter(s => !R[s]); if (fehlend.length) log("Fehlend:", fehlend.join(","));
  const S = ST.signale(H);
  if (Z.lastEval === S.datum && !FORCE && PLAN.version === VERSION) { log("Schon ausgewertet:", S.datum); return false }
  const vorherZiel = ST.ziel(Z.picks ? Z : {mode: "M", gold: 0, fallback: [], picks: []});
  const {ev, geaendert, rank, euRank} = ST.auswerten(Z, H, S);
  stateGeaendert = true;
  // Preise (Euro, letzter Kurs)
  const fxNow = {USD: R[EURUSD].c.at(-1), CHF: R[EURCHF] ? R[EURCHF].c.at(-1) : 1}, preise = {};
  for (const s of syms) if (R[s] && ![EURUSD, EURCHF].includes(s)) {
    const p = R[s].c.at(-1), pp = R[s].c.at(-2); preise[s] = {eur: euroPreis(s, p, fxNow), cur: p, w: waehrung(s), chg: pp ? (p / pp - 1) * 100 : 0};
  }
  const w = ST.ziel(Z);
  const ga = ST.goldPruefung(H, Z.mode === "E" ? Z.fallback : Z.picks);
  // Aufträge bei Änderung des Ziels (oder beim Start)
  await depotLaden();
  if (geaendert || ev.some(e => e.t === "start")) {
    const pr = Object.fromEntries(Object.entries(preise).map(([s, x]) => [s, x.eur]));
    const o = DEPOT ? ST.auftraege(w, DEPOT, pr) : {gesamt: 0, liste: []};
    Z.orders = {id: Date.now().toString(36), d: S.datum, grund: ev.map(e => e.text).join(" "), liste: o.liste, gesamt: o.gesamt, done: !o.liste.length};
  }
  Z.log = [...ev.map(e => ({d: S.datum, t: e.t, text: e.text})), ...(Z.log || [])].slice(0, 200);
  // plan.json für die App
  const pickSet = new Set(Z.picks), fbSet = new Set(Z.fallback || []);
  const ri = r => ({s: r.s, n: r.n, sec: r.sec, reg: r.reg, mom: Math.round(r.mom * 10000) / 10000, pick: pickSet.has(r.s), fb: fbSet.has(r.s)});
  const n = Math.min(260, H[SPY].c.length), spyC = H[SPY].c, smaS = spyC.map((_, i) => i >= 199 ? spyC.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : null);
  Object.assign(PLAN, {
    version: VERSION, asOf: S.datum, erstellt: new Date().toISOString(), modus: Z.mode, modusText: ST.MODUS[Z.mode], expo: Z.expo, gold: Z.gold,
    picks: Z.picks, picksYear: Z.picksYear, picksVorlaeufig: !!Z.picksInit && (new Date(termine(S.datum, Z).jahreswechsel) - new Date(S.datum)) / 864e5 < 35,
    fallback: Z.fallback || [], ziel: w, signale: {...S, aktien6: ga.aktien, gold6: ga.gold},
    rangliste: rank.slice(0, 30).map(ri), euRangliste: euRank.slice(0, 15).map(ri),
    preise, namen: NAME, orders: Z.orders, log: Z.log.slice(0, 60),
    termine: termine(S.datum, Z), chart: {d: H[SPY].d.slice(-n), c: spyC.slice(-n).map(v => +v.toFixed(2)), s: smaS.slice(-n).map(v => v && +v.toFixed(2))},
    fehlend,
    radar: spyC.slice(-30).map((v, i, arr) => { const sm = smaS.slice(-30)[i]; return sm ? +((v / sm - 1) * 100).toFixed(2) : null }),
    renditen: {
      geldmarkt1J: R[GELD] ? ST.rendite1J(H[GELD].c) : null, gold1J: R[GOLD] ? ST.rendite1J(H[GOLD].a) : null, stoxx1J: R[STOXX] ? ST.rendite1J(H[STOXX].a) : null,
      top10Mom: avg(Z.picks.map(s => H[s] && ST.momentum(H[s].a))), euMom: avg((Z.fallback || []).map(s => H[s] && ST.momentum(H[s].a))),
    },
  });
  planGeaendert = true;
  // Nachrichten
  if (ev.length) {
    const offen = Z.orders && !Z.orders.done && Z.orders.d === S.datum;
    await send(`📣 <b>Anlageplan – ${S.datum}</b>\n\n${ev.map(e => esc(e.text)).join("\n")}\n\n${signalText()}` +
      (offen ? `\n\n<b>Aufträge (${eur(Z.orders.gesamt)} Depot):</b>\n${auftragText(Z.orders)}` : (geaendert && !DEPOT?.cash && !Object.keys(DEPOT?.pos || {}).length ? "\n\nTrage dein Depot in der App ein, dann bekommst du genaue Stückzahlen." : "")) + link("status"),
      offen ? [[{text: "✅ Erledigt – ins Depot übernehmen", callback_data: "erl:" + Z.orders.id}]] : null);
  }
  abendHinweise(S, H, w, rank, preise);
  return true;
}
const avg = a => { a = a.filter(x => x != null && isFinite(x)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null };
function termine(d, Z) {
  const t = new Date(d + "T12:00:00Z"), iso = x => x.toISOString().slice(0, 10);
  const werktag = (s, extra = []) => { const x = new Date(s + "T12:00:00Z"); while ([0, 6].includes(x.getUTCDay()) || extra.includes(iso(x).slice(5))) x.setUTCDate(x.getUTCDate() + 1); return iso(x) };
  let thu = new Date(t); thu.setUTCDate(thu.getUTCDate() + 1); while (thu.getUTCDay() !== 4) thu.setUTCDate(thu.getUTCDate() + 1);
  const Y = t.getUTCFullYear(), M = t.getUTCMonth() + 1, q = [1, 4, 7, 10].find(m => m > M) || 13;
  const gc = werktag(q === 13 ? `${Y + 1}-01-01` : `${Y}-${String(q).padStart(2, "0")}-01`, ["01-01"]);
  const jw = werktag((Z.lastYear || 0) >= Y ? `${Y + 1}-11-21` : `${Y}-11-21`);
  return {donnerstag: iso(thu), goldCheck: gc, jahreswechsel: jw};
}
function abendHinweise(S, H, w, rank, preise) {
  const ab = (S.spy / S.spySma - 1) * 100, tag = new Date(S.datum + "T12:00:00Z").getUTCDay();
  // Markt-Radar im Crash-Modus: Zähler der Tage über der Linie (Rückkehr erst nach 10 Handelstagen)
  if (Z.mode !== "U") {
    const t = S.tageUeber || 0, vorher = Z.radarTage || 0, B10 = ST.BESTAETIGUNG;
    if (t > 0 && (t === 1 || t === 5 || (t >= B10 && vorher < B10)))
      send(t >= B10 ? `✅ <b>Markt-Radar:</b> S&amp;P 500 liegt seit ${t} Handelstagen über seiner 200-Tage-Linie – <b>2 Wochen bestätigt</b>. ${tag === 4 ? "Die Kaufaufträge kommen jetzt." : "Am Donnerstagabend kommen die Kaufaufträge für die Top 10. Halte dein Geld bereit."}` + link("status")
        : `📈 <b>Markt-Radar:</b> S&amp;P 500 schließt ${ST.f1(ab)} % über seiner 200-Tage-Linie – Tag <b>${t} von ${B10}</b>. Erst nach 2 Wochen durchgehend darüber steigst du wieder in Aktien ein. Noch nichts tun.` + link("status"));
    if (t === 0 && vorher >= 2) send(`↩️ <b>Markt-Radar:</b> S&amp;P 500 ist nach ${vorher} Tagen wieder unter die Linie gefallen. Zähler zurück auf 0 – du bleibst im ${ST.MODUS[Z.mode]}.`);
    Z.radarTage = t; stateGeaendert = true;
  } else Z.radarTage = 0;
  if (tag === 4 && !(Z.log || []).some(l => l.d === S.datum && ["crash", "zurueck"].includes(l.t))) {
    const top = (Z.picks || []).map(nm).slice(0, 10).join(", ");
    send(Z.mode === "U" ? `🗓️ <b>Donnerstags-Check ${S.datum}:</b> alles im Plan. S&amp;P 500 ${ST.f1(ab)} % über der Linie, Schwankung ${ST.f1(S.vol)} % → ${Z.expo} % investiert. Nichts zu tun.`
      : `🗓️ <b>Donnerstags-Check ${S.datum}:</b> noch Crash-Modus (${ST.MODUS[Z.mode]}). ${ab >= 0 ? `S&amp;P 500 ${ST.f1(ab)} % über der Linie, seit ${S.tageUeber} von ${ST.BESTAETIGUNG} Tagen – noch nicht bestätigt.` : `S&amp;P 500 ${ST.f1(ab)} % unter der Linie – er muss um ca. ${ST.f1(S.spySma / S.spy * 100 - 100)} % steigen und dann 2 Wochen darüber bleiben.`} Nächste Prüfung in einer Woche, Vorwarnung kommt vorher.\n\nBereit für den Wiedereinstieg: ${esc(top)}` + link("status"));
  }
  if (Z.mode === "U" && ab >= 0 && ab < 2) hinweis("spy-nah", 5, `⚠️ <b>Vorwarnung:</b> S&amp;P 500 nur noch ${ST.f1(ab)} % über seiner 200-Tage-Linie. Fällt er am Donnerstag darunter, wird alles verkauft. Jetzt nichts tun.`, "vorwarnung");
  if (Z.mode !== "U" && ab < 0 && ab > -2) hinweis("spy-zurueck", 5, `👀 S&amp;P 500 nur noch ${ST.f1(-ab)} % unter der 200-Tage-Linie – danach muss er 2 Wochen darüber bleiben, dann geht es zurück in die Top 10.`, "vorwarnung");
  if (Z.mode === "U" && S.vol > 22 && S.vol <= 25 && Z.expo === 100) hinweis("vol-nah", 5, `⚠️ Schwankung bei ${ST.f1(S.vol)} % – ab 25 % greift die Bremse (70 % investiert).`, "vorwarnung");
  if (Z.mode === "U" && Z.gold === 0) { const g = ST.goldPruefung(H, Z.picks); if (g.gold != null && g.aktien != null && g.gold > g.aktien) hinweis("gold-vorschau", 14, `🟡 Gold liegt gerade vorn (6 Monate: Gold ${ST.pc(g.gold)} vs. Aktien ${ST.pc(g.aktien)}). Bei der nächsten Gold-Prüfung kämen voraussichtlich 20 % Gold dazu. Jetzt nichts tun.`, "info") }
  // Zusatz-Hinweise zum echten Depot
  if (!DEPOT) return;
  let g = +DEPOT.cash || 0; for (const [s, x] of Object.entries(DEPOT.pos || {})) g += x.n * ((preise[s] || {}).eur || x.p);
  if (g <= 0) return;
  const naechste = rank.filter(r => !Z.picks.includes(r.s));
  for (const [s, x] of Object.entries(DEPOT.pos || {})) {
    const p = (preise[s] || {}).eur; if (!p || s === GELD) continue;
    const anteil = x.n * p / g, soll = w[s] || 0;
    if (soll > 0 && anteil > Math.max(0.15, soll * 1.5)) hinweis("gewicht-" + s, 20, `⚖️ <b>${esc(nm(s))}</b> macht inzwischen ${(anteil * 100).toFixed(1).replace(".", ",")} % deines Depots aus (Plan: ${(soll * 100).toFixed(0)} %). Laut Plan: liegen lassen bis zum Jahreswechsel. Optional: auf ${(soll * 100).toFixed(0)} % zurückführen und den Gewinn sichern.`, "zusatz", true);
    const h = H[s], sm = h && ST.sma(h.c, 200);
    if (x.p && p < x.p * 0.75 && sm && p < sm && s !== GOLD) {
      const k = naechste.find(r => !Object.keys(DEPOT.pos).includes(r.s));
      hinweis("schwach-" + s, 30, `📉 <b>${esc(nm(s))}</b> liegt ${((1 - p / x.p) * 100).toFixed(0)} % unter deinem Kaufkurs und unter der eigenen 200-Tage-Linie. Laut Plan: halten (kein Einzel-Stop). Optional: durch den nächsten Kandidaten ersetzen${k ? ` – das wäre <b>${esc(k.n)}</b> (+${(k.mom * 100).toFixed(0)} %)` : ""}.`, "zusatz", true);
    }
  }
}

/* ---------- Tagsüber ---------- */
async function tagsueber() {
  const z = zeit(); if (["Sat", "Sun"].includes(z.wd)) return;
  const min = z.h * 60 + z.m; if (min < 7 * 60 + 30 || min > 23 * 60) return; // Handelszeit Trade Republic
  if (B.intraday && Date.now() - B.intraday < 9 * 60e3 && !FORCE) return;
  B.intraday = Date.now();
  await depotLaden();
  const syms = [...new Set([SPY, EURUSD, EURCHF, GELD, GOLD, STOXX, ...Object.keys((DEPOT && DEPOT.pos) || {}), ...Object.keys(PLAN.ziel || {}), ...(Z.picks || []), ...(Z.fallback || [])])];
  const R = await alleKurse(syms, "5d"); if (!R[EURUSD]) return;
  const fx = {USD: R[EURUSD].live || R[EURUSD].c.at(-1), CHF: R[EURCHF] ? (R[EURCHF].live || R[EURCHF].c.at(-1)) : 1};
  PLAN.preise = PLAN.preise || {};
  for (const s of syms) {
    const r = R[s]; if (!r || [EURUSD, EURCHF].includes(s)) continue;
    const p = r.live || r.c.at(-1), prev = r.prev || r.c.at(-2), chg = prev ? (p / prev - 1) * 100 : 0;
    PLAN.preise[s] = {eur: euroPreis(s, p, fx), cur: p, w: waehrung(s), chg, live: new Date().toISOString()}; planGeaendert = true; PLAN.kurseVon = new Date().toISOString();
    if (s === SPY && Z.mode !== "U" && PLAN.signale && p > PLAN.signale.spySma && z.wd === "Thu" && (PLAN.signale.tageUeber || 0) >= ST.BESTAETIGUNG - 1) hinweis("spy-do-live", 1, `🔔 <b>Markt-Radar:</b> S&amp;P 500 ist seit 2 Wochen über seiner 200-Tage-Linie und liegt auch heute darüber. Schließt er heute Abend darüber, bekommst du nach Börsenschluss die Kaufaufträge für die Top 10. Halte dein Geld bereit.`, "vorwarnung");
    if (s === SPY && chg <= -3) hinweis("spy-tag", 1, `📉 S&amp;P 500 heute ${ST.f1(chg)} %. Laut Plan: nichts tun – entschieden wird Donnerstagabend an der 200-Tage-Linie.`, "info");
    if (s !== SPY && DEPOT && DEPOT.pos[s] && (chg <= -8 || chg >= 10)) hinweis("tag-" + s, 1, `${chg < 0 ? "📉" : "📈"} <b>${esc(nm(s))}</b> heute ${chg > 0 ? "+" : ""}${ST.f1(chg)} %. Laut Plan: halten, keine Einzel-Stopps.${chg >= 10 ? " Optional: bei starkem Übergewicht einen Teil sichern." : " Optional: News prüfen, ob sich am Unternehmen etwas Grundlegendes geändert hat."}`, "zusatz", true);
  }
}

/* ---------- Ablauf ---------- */
let geladen = false;
async function laden() { await depotLaden(); geladen = true; STUMM = readJSON(MF, STUMM);
  if (DEPOT && Z.orders && !Z.orders.done && DEPOT.erledigt === Z.orders.id) { Z.orders.done = true; stateGeaendert = true; if (PLAN.orders) { PLAN.orders.done = true; planGeaendert = true } } }
// eigeneTelegram: true, wenn dieser Wachmann allein läuft (sonst nimmt der Haupt-Wachmann die Befehle an)
export async function lauf({eigeneTelegram = false} = {}) {
  if (!geladen) await laden();
  if (eigeneTelegram) await telegram();
  const z = zeit(), min = z.h * 60 + z.m;
  // US-Schluss ist 22:00 (bzw. 21:00) Uhr deutscher Zeit. Auswertung ab 22:20 bis 6 Uhr morgens.
  if (FORCE || min >= 22 * 60 + 20 || min < 6 * 60 || !Z.lastEval || PLAN.version !== VERSION) {
    const ref = new Date(z.date + "T12:00:00Z"); if (min < 6 * 60) ref.setUTCDate(ref.getUTCDate() - 1);
    const wd = ref.getUTCDay(), soll = ref.toISOString().slice(0, 10);
    const faellig = FORCE || !Z.lastEval || PLAN.version !== VERSION || (wd >= 1 && wd <= 5 && Z.lastEval < soll);
    if (faellig && (FORCE || !B.versuch || Date.now() - B.versuch > 25 * 60e3)) { B.versuch = Date.now(); try { await tagesAuswertung() } catch (e) { log("Auswertung-Fehler:", e.stack) } }
  } else { try { await tagsueber() } catch (e) { log("Tagsüber-Fehler:", e.stack) } }
  if (eigeneTelegram) await telegram();
  await sichern();
}
export async function sichern() {
  if (stateGeaendert && !DRY) writeJSON(SF, Z);
  if (planGeaendert && !DRY) writeJSON(PF, PLAN);
  if (DRY) { writeJSON(P(".state/dry-plan.json"), PLAN); writeJSON(P(".state/dry-state.json"), Z) }
  writeJSON(BF, B);
  const files = [stummGeaendert && "data/stumm.json", stateGeaendert && "data/plan-state.json", planGeaendert && "data/plan.json", depotGeaendert && "data/depot.enc"].filter(Boolean);
  if (files.length && !DRY && E.GITHUB_ACTIONS) {
    const g = `git -C ${ROOT}`, wer = `-c user.name="Wachmann" -c user.email="wachmann@users.noreply.github.com"`;
    for (let i = 0; i < 3; i++) {
      try { execSync(`${g} add ${files.join(" ")} && (${g} diff --cached --quiet || ${g} ${wer} commit -q -m "Anlageplan: ${files.map(f => f.replace(/.*\//, "")).join(", ")}") && ${g} ${wer} pull -q --rebase -X theirs --autostash && ${g} push -q`, {stdio: "inherit"}); break }
      catch (e) { log("git", e.message); await sleep(3000) }
    }
  }
  stateGeaendert = planGeaendert = depotGeaendert = stummGeaendert = false;
  log("Anlageplan fertig", {modus: Z.mode, lastEval: Z.lastEval});
}
if (import.meta.url === `file://${process.argv[1]}`) lauf({eigeneTelegram: true}).catch(e => { console.error(e); process.exit(1) });
