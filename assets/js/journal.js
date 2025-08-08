import { DataStore, Session, Selectors, listTrades, createTrade, updateTrade, deleteTrade, setSelectedAccount, subscribeToTrades } from "./state.js";
import { fmt } from "./utils.js";

const DATE_FORMAT = "DD-MM-YYYY";

// DOM
const accDD = document.getElementById("accDD");
const accLbl = document.getElementById("accLbl");
const accMenu = document.getElementById("accMenu");
const openAccountsBtn = document.getElementById("openAccountsBtn");
// HACK: journal.html не содержит полноценный выпадающий список Accounts.
// В разметке есть только кнопка #openAccountsBtn. Поэтому делаем простой
// однострочный селектор в шапке, чтобы выбор был явным и синхронизировался с модалкой.
let headerAccountSelect = document.getElementById("headerAccountSelect");
const periodDD = document.getElementById("periodDD");
const periodLbl = document.getElementById("periodLbl");
const periodMenu = document.getElementById("periodMenu");
const filterSymbol = document.getElementById("filterSymbol");
const filterStrategy = document.getElementById("filterStrategy");
const filterResult = document.getElementById("filterResult");
const themeToggle = document.getElementById("themeToggle");

const kCount = document.getElementById("kCount");
const kWR = document.getElementById("kWR");
const kR = document.getElementById("kR");
const kPnl = document.getElementById("kPnl");

const btnAdd = document.getElementById("btnAdd");
const btnImport = document.getElementById("btnImport");
const btnExport = document.getElementById("btnExport");
const pageSizeSel = document.getElementById("pageSize");
const tbl = document.getElementById("tblTrades");
const tblBody = document.getElementById("tblBody");
const pagerInfo = document.getElementById("pagerInfo");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");

const csvInput = document.getElementById("csvInput");

// Modal
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const fStartAt = document.getElementById("fStartAt");     // Start date (DD-MM-YYYY)
const fStartTime = document.getElementById("fStartTime"); // Start time (HH:MM)
const fEndAt = document.getElementById("fEndAt");         // End date (DD-MM-YYYY)
const fEndTime = document.getElementById("fEndTime");     // End time (HH:MM)
const fAccount = document.getElementById("fAccount");     // Account (select)
const fPair = document.getElementById("fPair");           // Pair (symbol)
const fDirection = document.getElementById("fDirection"); // long/short
const fSession = document.getElementById("fSession");     // ASIA/FRANKFURT/LO_KZ/LUNCH/NY_KZ
const fResult = document.getElementById("fResult");       // win/be/loss
const fRR = document.getElementById("fRR");               // RR (manual)
const fRiskPct = document.getElementById("fRiskPct");     // Risk %
const fRiskUsd = document.getElementById("fRiskUsd");     // Risk $
const fRRAuto = document.getElementById("fRRAuto");       // RR Auto (read-only)
const fProfitPct = document.getElementById("fProfitPct"); // Profit % (read-only = RR)
const fNetUsd = document.getElementById("fNetUsd");       // Net Result $ (read-only = Risk$ * RR)
const fNotes = document.getElementById("fNotes");
const btnSave = document.getElementById("btnSave");
const btnDelete = document.getElementById("btnDelete");

/* ============== Page-local State ============== */
let sortBy = "exitAt"; // keep existing table columns for now
let sortDir = "desc";
let pageIdx = 0;
let pageSize = parseInt(pageSizeSel.value, 10) || 50;
let editingId = null;
let inited = false;

/* ============== Supabase sync helpers ============== */
async function refreshTrades() {
  try {
    setLoading(true);
    const rows = await listTrades({
      accountId: Session.selectedAccountId,
      limit: Number(pageSizeSel?.value) || 50,
      offset: pageIdx * (Number(pageSizeSel?.value) || 50)
    });
    DataStore.trades = rows;
    renderAll();
  } catch (e) {
    console.error("Failed to load trades from Supabase", e);
    toast("Не удалось загрузить сделки", "error");
  } finally {
    setLoading(false);
  }
}

// Подписка на изменения данных
function subscribeToDataChanges() {
  const unsubscribe = subscribeToDataChanges((e) => {
    if (e.type === "tj.trades.changed") {
      refreshTrades();
    } else if (e.type === "tj.accounts.changed") {
      renderAll();
    } else if (e.type === "tj.account.selected") {
      pageIdx = 0;
      renderAll();
    }
  });

  // Отписка при размонтировании компонента
  return () => {
    unsubscribe();
  };
}

function setLoading(isLoading) {
  if (btnAdd) btnAdd.disabled = isLoading;
  if (btnImport) btnImport.disabled = isLoading;
  if (btnExport) btnExport.disabled = isLoading;
  if (nextPageBtn) nextPageBtn.disabled = isLoading;
  if (prevPageBtn) prevPageBtn.disabled = isLoading;
}

function toast(msg, type = "info") {
  console[type === "error" ? "error" : "log"](msg);
}
/* ====================== Date utils (DD-MM-YYYY) ====================== */
function toISOFromDDMMYYYY(s) {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function fromISOToDDMMYYYY(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function toISOWithTime(dateDDMMYYYY, timeHHMM) {
  const d = toISOFromDDMMYYYY(dateDDMMYYYY);
  if (!d) return null;
  const hhmm = /^\d{2}:\d{2}$/.test((timeHHMM || "").trim()) ? timeHHMM.trim() : "00:00";
  return `${d}T${hhmm}:00.000Z`;
}
function fromISOToHHMM(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ====================== Period menu ====================== */
function hydratePeriodMenu() {
  periodMenu.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      periodMenu.querySelectorAll("li").forEach(n => n.classList.remove("active"));
      li.classList.add("active");
      periodLbl.textContent = li.textContent || "Период";
      periodDD.classList.remove("open");
      renderAll();
    });
  });
}

/* ====================== Modal ====================== */
function openModal(trade = null) {
  editingId = trade?.id || null;
  if (modalTitle) modalTitle.textContent = editingId ? "Редактировать сделку" : "Добавить сделку";

  // Accounts
  if (fAccount) {
    fAccount.innerHTML = "";
    // Всегда заполняем по списку аккаунтов из базы
    const accs = Selectors.getAccounts();
    // Выбор по приоритету:
    // 1) accountId сделки (при редактировании)
    // 2) сохранённый глобальный выбор (tj.selectedAccountId)
    // 3) Session.selectedAccountId
    // 4) первый аккаунт в списке
    let preferredId = trade?.accountId || null;
    try {
      if (!preferredId) preferredId = localStorage.getItem("tj.selectedAccountId");
    } catch {}
    if (!preferredId) preferredId = Session.selectedAccountId;
    if (!preferredId && accs.length) preferredId = accs[0].id;

    accs.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      if (preferredId === a.id) opt.selected = true;
      fAccount.appendChild(opt);
    });

    // Сохраняем выбор глобально при изменении пользователем
    fAccount.addEventListener("change", () => setSelectedAccount(fAccount.value), { once: false });
  }

  // Prefill (map from state model)
  const startISO = trade?.entryAt || new Date().toISOString();
  const endISO = trade?.exitAt || trade?.entryAt || startISO;
  if (fStartAt) fStartAt.value = fromISOToDDMMYYYY(startISO);
  if (fStartTime) fStartTime.value = fromISOToHHMM(startISO) || "00:00";
  if (fEndAt) fEndAt.value = fromISOToDDMMYYYY(endISO);
  if (fEndTime) fEndTime.value = fromISOToHHMM(endISO) || "00:00";
  if (fPair) fPair.value = trade?.symbol || "";
  if (fDirection) fDirection.value = trade?.side || "long";
  if (fSession) fSession.value = trade?.session || "ASIA";
  if (fResult) fResult.value = trade?.result || (Number(trade?.pnl||0) > 0 ? "win" : Number(trade?.pnl||0) === 0 ? "be" : "loss");
  if (fRR) fRR.value = trade?.r ?? 0;
  if (fRiskPct) fRiskPct.value = trade?.riskPct ?? 0;
  if (fRiskUsd) fRiskUsd.value = trade?.riskAmountUsd ?? 0;

  // Derived (spec):
  // Profit% = Risk% * RR (manual)
  const rrVal = Number(String(fRR?.value || 0).replace(",", "."));
  const riskPctVal = Number(String(fRiskPct?.value || 0).replace(",", "."));
  const profitPctVal = (riskPctVal || 0) * (rrVal || 0);
  // RR Auto: copy RR if provided; otherwise Profit%/Risk% (guard 0)
  const rrAutoVal = rrVal || (riskPctVal ? (profitPctVal / riskPctVal) : 0);
  // Net$ = Deposit * (Profit% / 100)
  const accForDerived = Selectors.getAccounts().find(a => a.id === (fAccount?.value || Session.selectedAccountId));
  const depositForDerived = accForDerived?.startingEquity || 0;
  const netUsdVal = depositForDerived * (profitPctVal / 100);

  if (fRRAuto) fRRAuto.value = Number(rrAutoVal || 0).toFixed(4);
  if (fProfitPct) fProfitPct.value = Number(profitPctVal || 0).toFixed(4);
  if (fNetUsd) fNetUsd.value = Number(netUsdVal || 0).toFixed(2);

  if (modalBackdrop) modalBackdrop.style.display = "block";
  if (modal) modal.style.display = "block";

  // При открытии модалки — жёстко синхронизируем с селектором в хедере (если он есть)
  if (headerAccountSelect && fAccount) {
    if (headerAccountSelect.value) {
      fAccount.value = headerAccountSelect.value;
      setSelectedAccount(headerAccountSelect.value);
    }
  }

  // focus and Esc-close
  if (fStartAt) setTimeout(() => fStartAt.focus(), 0);
  const onEsc = (e) => { if (e.key === "Escape") { e.preventDefault(); closeModal(); document.removeEventListener("keydown", onEsc); } };
  document.addEventListener("keydown", onEsc, { once: true });
}

function closeModal() {
  modalBackdrop.style.display = "none";
  modal.style.display = "none";
  editingId = null;
}

function collectForm() {
  const startISO = toISOWithTime(fStartAt?.value, fStartTime?.value);
  const endISO = toISOWithTime(fEndAt?.value, fEndTime?.value) || startISO;
  const rr = fRR?.value ? Number(String(fRR.value).replace(",", ".")) : 0;
  const riskPct = fRiskPct?.value ? Number(String(fRiskPct.value).replace(",", ".")) : 0;
  const riskUsd = fRiskUsd?.value ? Number(String(fRiskUsd.value).replace(",", ".")) : 0;

  // Derived according to spec:
  // Profit% = Risk% * RR (manual)
  const profitPct = (riskPct || 0) * (rr || 0);
  // RR Auto: copy RR if provided; else Profit% / Risk% (guard 0)
  const rrAuto = rr || (riskPct ? (profitPct / riskPct) : 0);
  // Net$ = Deposit * (Profit% / 100), Deposit = startingEquity of selected account
  const acc = Selectors.getAccounts().find(a => a.id === (fAccount?.value || Session.selectedAccountId));
  const deposit = acc?.startingEquity || 0;
  const netUsd = deposit * (profitPct / 100);

  return {
    id: editingId || null,
    accountId: fAccount?.value,
    symbol: (fPair?.value || "").trim(),
    side: fDirection?.value || "long",
    session: fSession?.value || "ASIA",
    result: fResult?.value || "be",
    r: rr,
    riskPct,
    riskAmountUsd: riskUsd,
    entryAt: startISO,
    exitAt: endISO || startISO,
    notes: (fNotes?.value || "").trim(),
    // Derived for UI usage (state.js compute uses pnl)
    pnl: Number(netUsd || 0)
  };
}

function validateTrade(t) {
  if (!t.accountId) return "Аккаунт обязателен";
  if (!t.symbol) return "Пара (Pair) обязательна";
  if (!t.entryAt) return "Start date обязательна";
  if (!["long","short"].includes(t.side)) return "Direction некорректен";
  if (!["ASIA","FRANKFURT","LO_KZ","LUNCH","NY_KZ"].includes(t.session)) return "Session некорректен";
  if (!["win","be","loss"].includes(t.result)) return "Result некорректен";
  return null;
}
/** Pagination helper */
function paginate(rows) {
  const start = pageIdx * pageSize;
  const end = start + pageSize;
  return rows.slice(start, end);
}

/** Render table */
function renderTable(rows) {
  tblBody.innerHTML = "";
  const pageRows = paginate(rows);
  pageRows.forEach(tr => {
    const trEl = document.createElement("tr");
    const rr2 = Number(tr.r || 0).toFixed(2);
    const net2 = Number(tr.pnl || 0).toFixed(2);
    trEl.innerHTML = `
      <td>${fromISOToDDMMYYYY(tr.exitAt || tr.entryAt)}</td>
      <td>${tr.symbol || ""}</td>
      <td>${tr.strategy || ""}</td>
      <td class="${(tr.r||0) >= 0 ? "r-pos" : "r-neg"}">${rr2}RR / ${net2}$</td>
      <td class="${(tr.pnl||0) >= 0 ? "r-pos" : "r-neg"}">${(tr.pnl||0) >= 0 ? "+" : "−"}${fmt.currency(Math.abs(Number(tr.pnl||0)), Selectors.getAccounts().find(a => a.id === tr.accountId)?.currency || DataStore.currency)}</td>
      <td>${(tr.notes || "").slice(0,80)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn xs ghost act-edit">Редактировать</button>
        <button class="btn xs ghost act-del" style="color:var(--red);border-color:var(--red);">Удалить</button>
      </td>
    `;
    trEl.querySelector(".act-edit").addEventListener("click", () => openModal(tr));
    trEl.querySelector(".act-del").addEventListener("click", async () => {
      if (!confirm("Удалить сделку?")) return;
      try {
        setLoading(true);
        await deleteTrade(tr.id);
        await refreshTrades();
      } catch (e) {
        console.error("Delete trade failed", e);
        toast("Ошибка удаления сделки", "error");
      } finally {
        setLoading(false);
      }
    });
    tblBody.appendChild(trEl);
  });

  // pager
  const total = rows.length;
  const start = total ? (pageIdx * pageSize + 1) : 0;
  const end = Math.min(total, (pageIdx + 1) * pageSize);
  pagerInfo.textContent = `${start}-${end} из ${total}`;
  prevPageBtn.disabled = pageIdx === 0;
  nextPageBtn.disabled = end >= total;
}

/** CSV helpers */
function parseCsv(text) {
  // Simple CSV parser, supports quoted fields and commas; delimiter ","
  const rows = [];
  let cur = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (field !== "" || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (ch === "\r" && text[i+1] === "\n") i++; // handle CRLF
      } else { field += ch; }
    }
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function mapCsvRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length) continue;
    const row = (n) => {
      const v = r[idx(n)];
      return v == null ? "" : String(v).trim();
    };
    const id = row("id") || genId("t");
    const accountId = row("accountId") || Session.selectedAccountId;
    const symbol = row("symbol");
    const strategy = row("strategy");
    const side = row("side") || "long";
    const qty = Number((row("qty") || "1").replace(",", "."));
    const entryPrice = row("entryPrice") ? Number(row("entryPrice").replace(",", ".")) : undefined;
    const exitPrice = row("exitPrice") ? Number(row("exitPrice").replace(",", ".")) : undefined;
    const rVal = row("r") ? Number(row("r").replace(",", ".")) : 0;
    const pnl = row("pnl") ? Number(row("pnl").replace(",", ".")) : 0;
    const fees = row("fees") ? Number(row("fees").replace(",", ".")) : 0;
    const entryAt = toISOFromDDMMYYYY(row("entryAt")) || toISOFromDDMMYYYY(row("exitAt"));
    const exitAt = toISOFromDDMMYYYY(row("exitAt")) || entryAt;
    const tags = (row("tags") || "").split(";").map(s => s.trim()).filter(Boolean);
    const notes = row("notes") || "";
    // minimal validation
    if (!accountId || !symbol || !strategy || !exitAt) continue;
    out.push({ id, accountId, symbol, strategy, side, qty, entryPrice, exitPrice, r: rVal, pnl, fees, entryAt, exitAt, tags, notes });
  }
  return out;
}

function exportCsv(rows) {
  const header = ["id","accountId","symbol","strategy","side","qty","entryPrice","exitPrice","r","pnl","fees","entryAt","exitAt","tags","notes"];
  const lines = [header.join(",")];
  rows.forEach(t => {
    const vals = [
      t.id,
      t.accountId,
      t.symbol,
      t.strategy,
      t.side || "long",
      t.qty ?? 1,
      t.entryPrice ?? "",
      t.exitPrice ?? "",
      t.r ?? 0,
      t.pnl ?? 0,
      t.fees ?? 0,
      t.entryAt || t.exitAt || "",
      t.exitAt || t.entryAt || "",
      Array.isArray(t.tags) ? t.tags.join(";") : (t.tags || ""),
      (t.notes || "").replace(/[\r\n]+/g, " ")
    ].map(v => {
      const s = String(v);
      return (s.includes(",") || s.includes('"')) ? `"${s.replace(/"/g,'""')}"` : s;
    });
    lines.push(vals.join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "trades.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/** Filtering with period/symbol/strategy/result */
function getFilteredTrades() {
  const accId = Session.selectedAccountId;
  // restore period code if saved
  let savedPeriod = "ALL";
  try { savedPeriod = localStorage.getItem("tj.journal.period") || "ALL"; } catch {}

  // map period to date threshold
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - ((startOfDay.getDay() + 6) % 7)); // Monday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOf3M = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const startOfYTD = new Date(now.getFullYear(), 0, 1);

  function inPeriod(dISO) {
    if (!dISO) return false;
    const d = new Date(dISO);
    if (isNaN(d.getTime())) return false;
    switch (savedPeriod) {
      case "1D": return d >= startOfDay;
      case "1W": return d >= startOfWeek;
      case "1M": return d >= startOfMonth;
      case "3M": return d >= startOf3M;
      case "YTD": return d >= startOfYTD;
      case "ALL":
      default: return true;
    }
  }

  const symQ = (filterSymbol?.value || "").toLowerCase().trim();
  const stratQ = (filterStrategy?.value || "").toLowerCase().trim();
  const resQ = (filterResult?.value || "all").toLowerCase();

  return DataStore.trades
    .filter(t => !accId || t.accountId === accId)
    .filter(t => inPeriod(t.exitAt || t.entryAt))
    .filter(t => symQ ? (t.symbol || "").toLowerCase().includes(symQ) : true)
    .filter(t => stratQ ? (t.strategy || "").toLowerCase().includes(stratQ) : true)
    .filter(t => {
      if (resQ === "win") return (t.pnl || 0) > 0;
      if (resQ === "loss") return (t.pnl || 0) < 0;
      if (resQ === "be") return Number(t.pnl || 0) === 0;
      return true;
    })
    .sort((a,b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
}

/** KPIs render */
function renderKpis(rows) {
  const count = rows.length;
  const wins = rows.filter(r => (r.pnl||0) > 0).length;
  const wr = count ? (wins / count) * 100 : 0;
  const totalR = rows.reduce((s,r) => s + (Number(r.r||0) || 0), 0);
  const totalPnl = rows.reduce((s,r) => s + (Number(r.pnl||0) || 0), 0);

  if (kCount) kCount.textContent = String(count);
  if (kWR) kWR.textContent = (wr).toFixed(1) + "%";
  if (kR) kR.textContent = (totalR >= 0 ? "+" : "−") + Math.abs(totalR).toFixed(2);
  if (kPnl) kPnl.textContent = (totalPnl >= 0 ? "+" : "−") + fmt.currency(Math.abs(totalPnl), DataStore.currency);
}

/** Render all */
function renderAll() {
  const rows = getFilteredTrades();
  renderKpis(rows);
  renderTable(rows);
}

function wireEvents() {
  // theme (with persist)
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const current = root.getAttribute("data-theme") || "light";
      const next = current === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("tj.theme", next); } catch {}
    });
  }

  // filters (persist + Esc clear)
  if (filterSymbol) {
    try { const v = localStorage.getItem("tj.journal.filterSymbol"); if (v != null) filterSymbol.value = v; } catch {}
    filterSymbol.addEventListener("input", () => { try { localStorage.setItem("tj.journal.filterSymbol", filterSymbol.value); } catch {} pageIdx = 0; renderAll(); });
    filterSymbol.addEventListener("keydown", (e) => { if (e.key === "Escape") { filterSymbol.value = ""; try { localStorage.setItem("tj.journal.filterSymbol",""); } catch {} pageIdx=0; renderAll(); }});
  }
  if (filterStrategy) {
    try { const v = localStorage.getItem("tj.journal.filterStrategy"); if (v != null) filterStrategy.value = v; } catch {}
    filterStrategy.addEventListener("input", () => { try { localStorage.setItem("tj.journal.filterStrategy", filterStrategy.value); } catch {} pageIdx = 0; renderAll(); });
    filterStrategy.addEventListener("keydown", (e) => { if (e.key === "Escape") { filterStrategy.value = ""; try { localStorage.setItem("tj.journal.filterStrategy",""); } catch {} pageIdx=0; renderAll(); }});
  }
  if (filterResult) {
    try { const v = localStorage.getItem("tj.journal.filterResult"); if (v) filterResult.value = v; } catch {}
    filterResult.addEventListener("change", () => { try { localStorage.setItem("tj.journal.filterResult", filterResult.value); } catch {} pageIdx = 0; renderAll(); });
  }

  // sorting with indicator
  if (tbl) {
    tbl.querySelectorAll("th[data-sort]").forEach(th => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-sort");
        if (sortBy === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
        else { sortBy = key; sortDir = "asc"; }
        renderAll();
        // update header indicators ▲▼
        tbl.querySelectorAll("th[data-sort]").forEach(h => h.textContent = h.textContent.replace(/[ ▲▼]+$/,""));
        th.textContent = th.textContent.replace(/[ ▲▼]+$/,"") + (sortDir === "asc" ? " ▲" : " ▼");
      });
    });
  }

  // paging with persist
  if (pageSizeSel) {
    try { const ps = localStorage.getItem("tj.journal.pageSize"); if (ps) { pageSizeSel.value = ps; pageSize = parseInt(ps,10) || pageSize; } } catch {}
    pageSizeSel.addEventListener("change", () => {
      pageSize = parseInt(pageSizeSel.value, 10) || 50;
      try { localStorage.setItem("tj.journal.pageSize", String(pageSize)); } catch {}
      pageIdx = 0;
      renderAll();
    });
  }
  if (prevPageBtn) prevPageBtn.addEventListener("click", () => { pageIdx = Math.max(0, pageIdx - 1); renderAll(); });
  if (nextPageBtn) nextPageBtn.addEventListener("click", () => { pageIdx = pageIdx + 1; renderAll(); });
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
    if (e.key === "Home") { pageIdx = 0; renderAll(); }
    if (e.key === "End") { const total = getFilteredTrades().length; pageIdx = Math.max(0, Math.floor((total-1)/pageSize)); renderAll(); }
    if (e.key.toLowerCase() === "n") { e.preventDefault(); openModal(); }
    if (e.key.toLowerCase() === "t") { e.preventDefault(); if (themeToggle) themeToggle.click(); }
  });

  // modal controls
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);
  if (btnAdd) btnAdd.addEventListener("click", () => openModal());
  // open accounts page from button if present
  if (openAccountsBtn) openAccountsBtn.addEventListener("click", () => { window.location.href = "accounts.html"; });

  if (btnSave) btnSave.addEventListener("click", async () => {
    const t = collectForm();
    const err = validateTrade(t);
    if (err) { alert(err); return; }
    try {
      setLoading(true);
      if (editingId) {
        await updateTrade(editingId, t);
      } else {
        await createTrade(t);
      }
      closeModal();
      await refreshTrades();
    } catch (e) {
      console.error("Save trade failed", e);
      toast("Ошибка сохранения сделки", "error");
    } finally {
      setLoading(false);
    }
  });

  // live derived fields (with account deposit)
  const recalcDerived = () => {
    const rr = Number(String(fRR?.value || 0).replace(",", "."));
    const riskPct = Number(String(fRiskPct?.value || 0).replace(",", "."));

    // Profit% = Risk% * RR
    const profitPct = (riskPct || 0) * (rr || 0);

    // RR Auto: if RR provided -> copy RR, else Profit%/Risk% (guard 0)
    const rrAuto = rr || (riskPct ? (profitPct / riskPct) : 0);

    // Net$ = Deposit * (Profit% / 100)
    const acc = Selectors.getAccounts().find(a => a.id === (fAccount?.value || Session.selectedAccountId));
    const deposit = acc?.startingEquity || 0;
    const net = deposit * (Number(profitPct) / 100);

    if (fRRAuto) fRRAuto.value = Number(rrAuto || 0).toFixed(4);
    if (fProfitPct) fProfitPct.value = Number(profitPct || 0).toFixed(4);
    if (fNetUsd) fNetUsd.value = Number(net || 0).toFixed(2);
  };
  [fRR, fRiskPct, fAccount].forEach(el => { if (el) el.addEventListener("input", recalcDerived); });
  if (fAccount) fAccount.addEventListener("change", recalcDerived);
  // initialize derived when opening modal
  recalcDerived();

  if (btnDelete) btnDelete.addEventListener("click", () => {
    if (!editingId) { closeModal(); return; }
    if (!confirm("Удалить сделку?")) return;
    const idx = DataStore.trades.findIndex(x => x.id === editingId);
    if (idx >= 0) {
      DataStore.trades.splice(idx, 1);
      persistToStorage();
    }
    closeModal();
    renderAll();
  });

  // CSV import with preview
  if (btnImport && csvInput) {
    btnImport.addEventListener("click", () => csvInput.click());
    csvInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const rows = parseCsv(text);
        const mapped = mapCsvRows(rows);
        const preview = mapped.slice(0, Math.min(10, mapped.length)).map(t => `${fromISOToDDMMYYYY(t.exitAt||t.entryAt)} ${t.symbol} ${t.strategy} r=${t.r} pnl=${t.pnl}`).join("\n");
        if (!confirm(`Предпросмотр (${mapped.length} записей):\n${preview}\n\nПрименить импорт?`)) { csvInput.value = ""; return; }
        // merge
        const byId = new Map(DataStore.trades.map(t => [t.id, t]));
        mapped.forEach(t => {
          if (byId.has(t.id)) Object.assign(byId.get(t.id), t);
          else DataStore.trades.push(t);
        });
        persistToStorage();
        renderAll();
        alert(`Импортировано: ${mapped.length}`);
      };
      reader.readAsText(file, "utf-8");
      csvInput.value = "";
    });
  }

  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const rows = getFilteredTrades();
      exportCsv(rows);
    });
  }
}

async function init() {
  if (inited) return;
  inited = true;
  // Self-test badge
  let status = document.getElementById("tj-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "tj-status";
    status.style.position = "fixed";
    status.style.right = "8px";
    status.style.bottom = "8px";
    status.style.padding = "6px 10px";
    status.style.border = "1px solid var(--border)";
    status.style.background = "var(--elev-1)";
    status.style.borderRadius = "8px";
    status.style.color = "var(--muted)";
    status.style.fontSize = "12px";
    status.style.zIndex = "9999";
    status.textContent = "Journal: Init…";
    document.body.appendChild(status);
  }
  try {
    // Theme restore
    const root = document.documentElement;
    let theme = null;
    try { theme = localStorage.getItem("tj.theme"); } catch {}
    if (theme) root.setAttribute("data-theme", theme);

    // ensure persistence helpers exist (guard against bundler reorders)
    if (typeof loadFromStorage !== "function") {
      console.warn("loadFromStorage missing, creating no-op shim");
      window.loadFromStorage = () => {};
    }
    if (typeof persistToStorage !== "function") {
      console.warn("persistToStorage missing, creating no-op shim");
      window.persistToStorage = () => {};
    }

  // первичная загрузка из Supabase
  await refreshTrades();

  // Жёсткая подгрузка аккаунтов из Supabase как источника истины,
  // чтобы селект показывал ровно те аккаунты, что на странице "Аккаунты".
  try {
    if (typeof Selectors?.refreshAccountsFromSupabase === "function") {
      await Selectors.refreshAccountsFromSupabase();
      subscribeToTrades();
      console.log("Journal: accounts loaded from Supabase via Selectors.refreshAccountsFromSupabase");
    } else {
      console.warn("Journal: no explicit loader for Supabase accounts; using Selectors.getAccounts()");
    }
  } catch (e) {
    console.error("Journal: failed to load accounts from Supabase", e);
  }

    // Safe hydration for dropdowns
    // Добавим жёсткую инициализацию даже если accDD/accLbl отсутствуют
    const hydrateAccountsDropdown = () => {
      try { console.log("Journal hdr sel: hydrate start"); } catch {}
      const accs = Selectors.getAccounts();
      try { console.log("Journal hdr sel: accounts", accs?.length || 0); } catch {}

      // Восстановить глобальный выбор
      try {
        const g = localStorage.getItem("tj.selectedAccountId");
        if (g) Session.selectedAccountId = g;
      } catch {}

      // Обновить подпись на кнопке (если есть)
      if (accLbl) {
        const selectedAcc = accs.find(a => a.id === Session.selectedAccountId) || accs[0];
        if (selectedAcc) accLbl.textContent = selectedAcc.name;
      }

      // Создать компактный селектор аккаунта в правой части хедера,
      // если полноразмерного dropdown в разметке нет.
      if (!headerAccountSelect) {
        headerAccountSelect = document.createElement("select");
        headerAccountSelect.id = "headerAccountSelect";
        headerAccountSelect.className = "input-compact";
        headerAccountSelect.style.marginRight = "8px";
        headerAccountSelect.style.minWidth = "180px";
        headerAccountSelect.style.padding = "6px 10px";
        headerAccountSelect.style.border = "1px solid var(--border)";
        headerAccountSelect.style.borderRadius = "10px";
        headerAccountSelect.style.background = "var(--elev-2)";
        headerAccountSelect.style.color = "var(--text)";
        // Вставка: сначала пытаемся в .ah-right, если нет — в header .app-header
        let inserted = false;
        const ahRight = document.querySelector(".ah-right");
        const themeBtn = document.getElementById("themeToggle");
        if (ahRight) {
          ahRight.insertBefore(headerAccountSelect, themeBtn || ahRight.firstChild);
          inserted = true;
          try { console.log("Journal hdr sel: inserted into .ah-right"); } catch {}
        }
        if (!inserted) {
          const header = document.querySelector(".app-header");
          if (header) {
            header.appendChild(headerAccountSelect);
            inserted = true;
            try { console.log("Journal hdr sel: appended to .app-header"); } catch {}
          }
        }
        if (!inserted) {
          headerAccountSelect.style.position = "fixed";
          headerAccountSelect.style.top = "12px";
          headerAccountSelect.style.right = "56px";
          headerAccountSelect.style.zIndex = "9999";
          document.body.appendChild(headerAccountSelect);
          try { console.log("Journal hdr sel: appended to body (fallback)"); } catch {}
        }
      }

      // Наполнить селектор аккаунтами
      headerAccountSelect.innerHTML = "";
      accs.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.name;
        if (a.id === Session.selectedAccountId) opt.selected = true;
        headerAccountSelect.appendChild(opt);
      });
      try { console.log("Journal hdr sel: options filled", headerAccountSelect.options.length); } catch {}

      // Обработчик изменения — это единая точка синхронизации
      headerAccountSelect.onchange = () => {
        setSelectedAccount(headerAccountSelect.value);
        // если открыта модалка, сразу меняем там select
        if (fAccount) fAccount.value = headerAccountSelect.value;
        renderAll();
        try { console.log("Journal hdr sel: changed ->", headerAccountSelect.value); } catch {}
      };

      // также поддержим старый список (если присутствует accMenu)
      if (accMenu) {
        accMenu.innerHTML = "";
        accs.forEach(a => {
          const li = document.createElement("li");
          li.textContent = a.name;
          li.dataset.value = a.id;
          if (a.id === Session.selectedAccountId) li.classList.add("active");
          li.addEventListener("click", (e) => {
            e.stopPropagation();
            headerAccountSelect.value = a.id;
            headerAccountSelect.dispatchEvent(new Event("change"));
            if (accDD) accDD.classList.remove("open");
          });
          accMenu.appendChild(li);
        });
      }
      try { console.log("Journal hdr sel: hydrate done"); } catch {}
    };
    if (accMenu && accLbl && accDD) {
      // Инициализация с поддержкой старого выпадающего
      hydrateAccountsDropdown();

      const accToggle = accDD.querySelector(".dropdown-toggle");
      if (accToggle) accToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        accDD.classList.toggle("open");
        if (periodDD) periodDD.classList.remove("open");
      });
    } else {
      // Даже если элементов нет — жёстко вставим селектор
      hydrateAccountsDropdown();
    }

    // When trades/accounts are refreshed externally, keep dropdown and modal synced
    document.addEventListener("tj.accounts.changed", () => {
      hydrateAccountsDropdown();
      if (fAccount && Session.selectedAccountId) fAccount.value = Session.selectedAccountId;
    });

    if (periodMenu && periodLbl && periodDD) {
      // restore period
      let savedPeriod = null;
      try { savedPeriod = localStorage.getItem("tj.journal.period"); } catch {}
      if (savedPeriod) {
        periodMenu.querySelectorAll("li").forEach(li => li.classList.toggle("active", li.dataset.value === savedPeriod));
        const lbl = periodMenu.querySelector(`li[data-value="${savedPeriod}"]`);
        if (lbl) periodLbl.textContent = lbl.textContent || "Период";
      }
      periodMenu.querySelectorAll("li").forEach(li => {
        li.addEventListener("click", (e) => {
          e.stopPropagation();
          periodMenu.querySelectorAll("li").forEach(n => n.classList.remove("active"));
          li.classList.add("active");
          periodLbl.textContent = li.textContent || "Период";
          try { localStorage.setItem("tj.journal.period", li.dataset.value || "ALL"); } catch {}
          periodDD.classList.remove("open");
          renderAll();
        });
      });
      const perToggle = periodDD.querySelector(".dropdown-toggle");
      if (perToggle) perToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        periodDD.classList.toggle("open");
        if (accDD) accDD.classList.remove("open");
      });
    }

    document.addEventListener("click", () => {
      if (accDD) accDD.classList.remove("open");
      if (periodDD) periodDD.classList.remove("open");
    });

    // Persist filters initial restore
    try {
      const v1 = localStorage.getItem("tj.journal.filterSymbol");
      if (v1 != null && filterSymbol) filterSymbol.value = v1;
      const v2 = localStorage.getItem("tj.journal.filterStrategy");
      if (v2 != null && filterStrategy) filterStrategy.value = v2;
      const v3 = localStorage.getItem("tj.journal.filterResult");
      if (v3 && filterResult) filterResult.value = v3;
      const ps = localStorage.getItem("tj.journal.pageSize");
      if (ps && pageSizeSel) { pageSizeSel.value = ps; pageSize = parseInt(ps,10) || pageSize; }
    } catch {}

    // Wire events safely (guarded)
    wireEvents();

    renderAll();

    status.textContent = "Journal OK";
    setTimeout(() => { const n = document.getElementById("tj-status"); if (n) n.remove(); }, 1500);
  } catch (e) {
    console.error("Journal init error:", e);
    status.textContent = "Journal error. See console.";
    status.style.border = "1px solid var(--red)";
    status.style.color = "var(--red)";
  }
}

// Start
/* ====================== Init ====================== */
init();
