import { DataStore, Session, Selectors, computeKpis, filterTradesByPeriod, setSelectedAccount, subscribeToTrades } from "./state.js";
import { renderRecentTrades, renderGoals, setKpi } from "./components.js";
import * as fmtUtils from "./utils.js";
import { makeEquityChart, makeWinrateChart, makePnlBars, makePie, updateChart } from "./charts.js";

/**
 * Minimal hash-based router + sidebar wiring for SPA
 * Pages: #/dashboard (default), #/journal, #/analytics, #/calendar, #/goals, #/accounts
 */
const viewEl = document.getElementById("view");
const dashMain = document.querySelector("main.dashboard");
const sidebar = document.getElementById("sidebar");
const sbBurger = document.getElementById("sbBurger");
const sbClose = document.getElementById("sbClose");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

// Sidebar controls - переключение между expanded и collapsed
function toggleSidebar() {
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle("collapsed");
  // Синхронизируем класс на body
  if (isCollapsed) {
    document.body.classList.add("sidebar-collapsed");
  } else {
    document.body.classList.remove("sidebar-collapsed");
  }
  
  // Сохраняем состояние в localStorage
  try {
    localStorage.setItem("tj.sidebar", isCollapsed ? "collapsed" : "expanded");
  } catch (e) {
    console.warn("Failed to save sidebar state:", e);
  }
  
  // На мобильных устройствах добавляем overflow hidden при раскрытой панели
  if (window.innerWidth <= 768) {
    if (isCollapsed) {
      document.body.classList.remove("sidebar-mobile-open");
    } else {
      document.body.classList.add("sidebar-mobile-open");
    }
  }
}

if (sbBurger) {
  sbBurger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add("active");
    toggleSidebar();
    setTimeout(() => {
      sbBurger.classList.remove("active");
    }, 200);
  });
  
  // Touch support для мобильных устройств
  sbBurger.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sbBurger.classList.add("active");
  });
  
  sbBurger.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sbBurger.classList.remove("active");
    toggleSidebar();
  });
}

// Кнопка закрытия (сворачивает панель)
if (sbClose) {
  sbClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar();
  });
  
  // Touch support для close кнопки
  sbClose.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sbClose.classList.add("active");
  });
  
  sbClose.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sbClose.classList.remove("active");
    toggleSidebar();
  });
}

// Close sidebar when clicking outside (только на мобильных устройствах)
document.addEventListener("click", (e) => {
  if (window.innerWidth > 768) return;
  
  if (sidebar && !sidebar.classList.contains("collapsed") && 
      !sidebar.contains(e.target) && 
      !e.target.closest("#sbBurger") &&
      !e.target.closest("#sbClose")) {
    toggleSidebar();
  }
});

// Prevent sidebar clicks from closing the sidebar
if (sidebar) {
  sidebar.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Добавляем обработчик для Escape键 (только на мобильных устройствах)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && window.innerWidth <= 768 && 
      sidebar && !sidebar.classList.contains("collapsed")) {
    toggleSidebar();
  }
});

// Восстанавливаем состояние боковой панели при загрузке
function restoreSidebarState() {
  if (!sidebar) return;
  let isCollapsed = false;
  try {
    const savedState = localStorage.getItem("tj.sidebar");
    isCollapsed = savedState === "collapsed";
  } catch (e) {
    console.warn("Failed to restore sidebar state:", e);
  }
  // На мобильных устройствах по умолчанию свернута
  if (window.innerWidth <= 768) {
    isCollapsed = true;
  }
  sidebar.classList.toggle("collapsed", isCollapsed);
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
}

// Обработка изменения размера окна
function handleResize() {
  if (!sidebar) return;
  const isMobile = window.innerWidth <= 768;
  const isCollapsed = sidebar.classList.contains("collapsed");
  if (isMobile) {
    document.body.classList.remove("sidebar-mobile-open");
    sidebar.style.width = "100vw";
    dashMain && (dashMain.style.maxWidth = "100vw");
  } else {
    sidebar.style.width = "";
    dashMain && (dashMain.style.maxWidth = "1400px");
  }
}

// Добавляем обработчик изменения размера окна
window.addEventListener("resize", handleResize);

// Вызываем восстановление состояния
restoreSidebarState();
// highlight active link
function setActiveNav(path) {
  document.querySelectorAll(".sb-link").forEach(a => {
    const href = a.getAttribute("href") || "";
    // Handle both SPA routes and external links
    const isCurrentRoute = href === "#/" + path || 
                          (href.startsWith("http") && window.location.pathname === href.replace(/^.*\/\/[^\/]+/, ""));
    a.classList.toggle("active", isCurrentRoute);
  });
}

// Handle navigation for SPA links
function handleSpaNavigation(e) {
  const link = e.target.closest(".sb-link");
  if (!link) return;
  
  e.preventDefault();
  const href = link.getAttribute("href");
  
  if (href.startsWith("#/")) {
    // SPA route
    window.location.hash = href;
  } else if (href.startsWith("http")) {
    // External link
    window.open(href, "_blank");
  } else {
    // Local page
    window.location.href = href;
  }
  
  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 768 && sidebar) {
    sidebar.classList.remove("open");
    document.body.classList.remove("sidebar-open");
  }
}
function mountPage(path) {
  setActiveNav(path);
  const isDash = path === "dashboard";
  if (dashMain) dashMain.style.display = isDash ? "" : "none";
  if (viewEl) {
    viewEl.style.display = isDash ? "none" : "";
    if (!isDash) viewEl.innerHTML = "";
  }
  switch (path) {
    case "journal":
      pageTitle && (pageTitle.textContent = "Журнал");
      pageSubtitle && (pageSubtitle.textContent = "Сделки и записи");
      // For now keep legacy journal.html link until ported
      viewEl && (viewEl.innerHTML = `
        <div class="card">
          <div class="card-header split">
            <h3>Журнал</h3>
            <a class="btn" href="journal.html">Открыть (временная ссылка)</a>
          </div>
          <div class="muted" style="padding:12px;">Страница журнала будет перенесена в SPA в отдельной итерации.</div>
        </div>
      `);
      break;
    case "analytics":
      pageTitle && (pageTitle.textContent = "Аналитика");
      pageSubtitle && (pageSubtitle.textContent = "обсудим позже");
      viewEl && (viewEl.innerHTML = `<div class="card"><div class="card-header"><h3>Аналитика</h3></div><div class="muted" style="padding:12px;">Заглушка.</div></div>`);
      break;
    case "calendar":
      pageTitle && (pageTitle.textContent = "Календарь");
      pageSubtitle && (pageSubtitle.textContent = "обсудим позже");
      viewEl && (viewEl.innerHTML = `<div class="card"><div class="card-header"><h3>Календарь</h3></div><div class="muted" style="padding:12px;">Заглушка.</div></div>`);
      break;
    case "goals":
      pageTitle && (pageTitle.textContent = "Цели");
      pageSubtitle && (pageSubtitle.textContent = "прогресс и задачи");
      viewEl && (viewEl.innerHTML = `<div class="card"><div class="card-header"><h3>Цели</h3></div><ul id="goalsListSpa" class="goals-list"></ul><div style="padding:12px;"><button id="addGoalBtnSpa" class="btn ghost">+ Цель</button></div></div>`);
      // simple reuse of existing renderer
      const gl = document.getElementById("goalsListSpa");
      renderGoals(gl, Selectors.getGoals(), {
        onProgressChange: (id, value) => {
          Selectors.updateGoalProgress(id, value);
          renderGoals(gl, Selectors.getGoals(), { onProgressChange: (id2, v2) => Selectors.updateGoalProgress(id2, v2) });
        }
      });
      const addGoalBtnSpa = document.getElementById("addGoalBtnSpa");
      if (addGoalBtnSpa) addGoalBtnSpa.addEventListener("click", () => {
        const title = prompt("Название цели");
        if (!title) return;
        const target = Number(prompt("Целевое значение (число)")) || 0;
        const unit = prompt("Единица (%, USD, trades, ...)", "%") || "%";
        const due = prompt("Дедлайн (YYYY-MM-DD)", "2025-12-31") || "2025-12-31";
        const goal = { id: "g" + Math.random().toString(36).slice(2,9), title, target, unit, progress: 0, due };
        Selectors.addGoal(goal);
        renderGoals(gl, Selectors.getGoals(), { onProgressChange: (id2, v2) => Selectors.updateGoalProgress(id2, v2) });
      });
      break;
    case "accounts":
      pageTitle && (pageTitle.textContent = "Аккаунты");
      pageSubtitle && (pageSubtitle.textContent = "управление и синхронизация");
      viewEl && (viewEl.innerHTML = `<div class="card"><div class="card-header split"><h3>Аккаунты</h3><button id="openAccountsBtnSpa" class="btn">Открыть менеджер</button></div><div class="muted" style="padding:12px;">Для CRUD используйте модальное окно.</div></div>`);
      document.getElementById("openAccountsBtnSpa")?.addEventListener("click", () => window.AccountsUI?.open && window.AccountsUI.open());
      // also auto-open once when visiting accounts route
      setTimeout(()=> window.AccountsUI?.open && window.AccountsUI.open(), 0);
      break;
    case "dashboard":
    default:
      pageTitle && (pageTitle.textContent = "Trading Journal");
      pageSubtitle && (pageSubtitle.textContent = "Главная");
      viewEl && (viewEl.innerHTML = "");
      // dashboard widgets already present in DOM below header
      break;
  }
}
function route() {
  const hash = window.location.hash || "#/dashboard";
  const path = hash.replace(/^#\//, "") || "dashboard";
  mountPage(path);
}
window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", () => {
  route();
  
  // Add navigation handlers to sidebar links
  document.querySelectorAll(".sb-link").forEach(link => {
    link.addEventListener("click", handleSpaNavigation);
  });
});

// DOM refs
const themeToggle = document.getElementById("themeToggle");
const userNameEl = document.getElementById("userName");

/**
 * Header controls
 * - Accounts dropdown was removed. Now we have a button #openAccountsBtn handled by accounts.js
 * - Period dropdown remains.
 */
const openAccountsBtn = document.getElementById("openAccountsBtn"); // may be null on some pages
// Compact account select for header (will be injected if missing)
let headerAccountSelect = document.getElementById("headerAccountSelect");
const periodDropdown = document.getElementById("periodDropdown");
const periodDropdownLabel = document.getElementById("periodDropdownLabel");
const periodDropdownMenu = document.getElementById("periodDropdownMenu");

const kEquityValue = document.getElementById("equityValue");
const kEquityDelta = document.getElementById("equityDelta");
const kWinRateValue = document.getElementById("winRateValue");
const kWinRateDelta = document.getElementById("winRateDelta");
const kTradesCountValue = document.getElementById("tradesCountValue");
const kTradesCountDelta = document.getElementById("tradesCountDelta");
const kPnlValue = document.getElementById("pnlValue");
const kPnlDelta = document.getElementById("pnlDelta");
const equityDateRange = document.getElementById("equityDateRange");

const recentTradesBody = document.getElementById("recentTradesBody");
const notesArea = document.getElementById("notesArea");
const saveNotesBtn = document.getElementById("saveNotesBtn");
const notesSaved = document.getElementById("notesSaved");
const addGoalBtn = document.getElementById("addGoalBtn");
const goalsList = document.getElementById("goalsList");
const journalLink = document.getElementById("journalLink");

// trades actions
const addTradeBtn = document.getElementById("addTradeBtn");

// notes features
const notesSort = document.getElementById("notesSort");
const noteImportant = document.getElementById("noteImportant");
const noteNewTag = document.getElementById("noteNewTag");
const addTagBtn = document.getElementById("addTagBtn");
const notesTags = document.getElementById("notesTags");

// Pie tabs
const pieTabButtons = document.querySelectorAll(".tab-buttons .btn");
let pieMode = "strategy";

// KPI sparklines
let sparkEquity, sparkWinrate, sparkTrades, sparkPnl;

// Charts
let equityChart, winrateChart, pnlChart, pieChart;

async function fetchNicknameViaSupabase() {
  try {
    const client = window.supabaseClient || (window.auth && window.auth.supabase);
    if (!client) return null;
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;

    // 1) из user_metadata.nickname
    const metaNick = user.user_metadata && user.user_metadata.nickname;
    if (metaNick) return String(metaNick);

    // 2) из таблицы profiles по id
    const { data: prof, error: pErr } = await client.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
    if (!pErr && prof && prof.nickname) return String(prof.nickname);

    return null;
  } catch {
    return null;
  }
}

async function ensureHeaderNickname() {
  if (!userNameEl) return;
  const nick = await fetchNicknameViaSupabase();
  if (nick) userNameEl.textContent = nick;
}

function init() {
  try {
    const status = document.createElement("div");
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
    status.textContent = "Init…";
    document.body.appendChild(status);

    // Восстанавливаем состояние боковой панели
    restoreSidebarState();

    // Проверяем существование элементов перед инициализацией
    if (viewEl) {
      hydrateSelectors();
      hydrateHeaderAccountSelect(); // ensure account selector exists and synced
      ensureHeaderNickname();
      subscribeToTrades();
      hydrateNotes();
      hydrateGoals();
      wireEvents();
      initCharts();
      renderAll();
    } else {
      // Если это не SPA страница, инициализируем только базовые функции
      hydrateSelectors();
      hydrateHeaderAccountSelect();
      ensureHeaderNickname();
    }

    // Подписка на изменения данных
    subscribeToDataChanges(() => {
      if (viewEl) renderAll();
    });

    status.textContent = "Dashboard OK";
    setTimeout(() => { const n = document.getElementById("tj-status"); if (n) n.remove(); }, 1500);
  } catch (e) {
    console.error("Dashboard init error:", e);
    let box = document.getElementById("tj-status");
    if (!box) {
      box = document.createElement("div");
      box.id = "tj-status";
      box.style.position = "fixed";
      box.style.right = "8px";
      box.style.bottom = "8px";
      box.style.padding = "8px 10px";
      box.style.border = "1px solid var(--red)";
      box.style.background = "var(--elev-1)";
      box.style.borderRadius = "8px";
      box.style.color = "var(--red)";
      box.style.fontSize = "12px";
      box.style.zIndex = "9999";
      document.body.appendChild(box);
    }
    box.textContent = "Dashboard error. See console.";
  }
}

function subscribeToDataChanges(callback) {
  const handlers = [];
  
  // Добавляем обработчики для разных типов событий
  const accountHandler = (e) => {
    if (e.type === "tj.accounts.changed") {
      if (typeof callback === "function") callback(e);
    }
  };
  
  const tradeHandler = (e) => {
    if (e.type === "tj.trades.changed") {
      if (typeof callback === "function") callback(e);
    }
  };
  
  const accountSelectedHandler = (e) => {
    if (e.type === "tj.account.selected") {
      if (typeof callback === "function") callback(e);
    }
  };

  // Подписываемся на события
  document.addEventListener("tj.accounts.changed", accountHandler);
  document.addEventListener("tj.trades.changed", tradeHandler);
  document.addEventListener("tj.account.selected", accountSelectedHandler);

  // Сохраняем обработчики для возможности отписки
  handlers.push(accountHandler, tradeHandler, accountSelectedHandler);

  // Функция отписки
  const unsubscribe = () => {
    handlers.forEach(handler => {
      document.removeEventListener("tj.accounts.changed", handler);
      document.removeEventListener("tj.trades.changed", handler);
      document.removeEventListener("tj.account.selected", handler);
    });
  };

  return unsubscribe;
}

function hydrateSelectors() {
  // Accounts dropdown removed: nothing to hydrate here.
  // Selected account used from Session; switching now happens in Accounts modal (future).

  // Period dropdown
  const periodOptions = [
    { v: "1D", t: "День" },
    { v: "1W", t: "Неделя" },
    { v: "1M", t: "Месяц" },
    { v: "3M", t: "3 месяца" },
    { v: "YTD", t: "YTD" },
    { v: "ALL", t: "Всё время" }
  ];
  if (!periodDropdownMenu || !periodDropdownLabel || !periodDropdown) {
    // If period controls are missing on the page, skip hydration gracefully
    return;
  }
  periodDropdownMenu.innerHTML = "";
  periodOptions.forEach(opt => {
    const li = document.createElement("li");
    li.textContent = opt.t;
    li.dataset.value = opt.v;
    if (opt.v === Session.period) li.classList.add("active");
    li.addEventListener("click", () => {
      Session.period = opt.v;
      periodDropdownLabel.textContent = opt.t;
      [...periodDropdownMenu.children].forEach(n => n.classList.toggle("active", n.dataset.value === opt.v));
      periodDropdown.classList.remove("open");
      renderAll();
    });
    periodDropdownMenu.appendChild(li);
  });
  const currentPeriod = periodOptions.find(p => p.v === Session.period);
  periodDropdownLabel.textContent = currentPeriod ? currentPeriod.t : "Период";
}

// Header account selector: creates/selects compact <select> and syncs with Session/localStorage
function hydrateHeaderAccountSelect() {
  // ensure accounts loaded
  if (typeof Selectors.refreshAccountsFromSupabase === "function") {
    // fire and forget; if already loaded, it will just re-emit event
    Selectors.refreshAccountsFromSupabase().catch(()=>{});
  }
  if (!headerAccountSelect) {
    headerAccountSelect = document.createElement("select");
    headerAccountSelect.id = "headerAccountSelect";
    headerAccountSelect.className = "input-compact";
    headerAccountSelect.style.minWidth = "180px";
    headerAccountSelect.style.padding = "6px 10px";
    headerAccountSelect.style.border = "1px solid var(--border)";
    headerAccountSelect.style.borderRadius = "10px";
    headerAccountSelect.style.background = "var(--elev-2)";
    headerAccountSelect.style.color = "var(--text)";
    // try to place into header right controls
    const ahRight = document.querySelector(".ah-right");
    const themeBtn = document.getElementById("themeToggle");
    if (ahRight) {
      ahRight.insertBefore(headerAccountSelect, themeBtn || ahRight.firstChild);
    } else {
      // fallback: append to header
      const header = document.querySelector(".app-header");
      if (header) header.appendChild(headerAccountSelect);
      else document.body.appendChild(headerAccountSelect);
    }
  }
  const fill = () => {
    const accs = Selectors.getAccounts();
    headerAccountSelect.innerHTML = "";
    accs.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      if (a.id === Session.selectedAccountId) opt.selected = true;
      headerAccountSelect.appendChild(opt);
    });
  };
  fill();
  headerAccountSelect.onchange = () => {
    setSelectedAccount(headerAccountSelect.value);
    renderAll();            // KPIs/charts/recent
  };
  // react to global account/trade changes
  document.addEventListener("tj.accounts.changed", () => { fill(); renderAll(); });
  document.addEventListener("tj.account.selected", (e) => {
    // external changes (e.g., Journal) reflect here
    if (e?.detail?.id) headerAccountSelect.value = e.detail.id;
    renderAll();
  });
  document.addEventListener("tj.trades.changed", () => renderAll());
}

function hydrateNotes() {
  notesArea.value = Selectors.getNotes() || "";
}

function hydrateGoals() {
  renderGoals(goalsList, Selectors.getGoals(), {
    onProgressChange: (id, value) => {
      Selectors.updateGoalProgress(id, value);
      renderGoals(goalsList, Selectors.getGoals(), { onProgressChange: (id2, v2) => Selectors.updateGoalProgress(id2, v2) });
    }
  });
}

function wireEvents() {
  // хоткеи: P — период, T — тема, J — журнал, A — открыть модалку Accounts
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
    if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (window.AccountsUI && window.AccountsUI.open) window.AccountsUI.open();
    } else if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      if (periodDropdown) periodDropdown.classList.toggle("open");
    } else if (e.key.toLowerCase() === "t") {
      e.preventDefault();
      toggleTheme();
    } else if (e.key.toLowerCase() === "j") {
      e.preventDefault();
      window.location.href = "journal.html";
    }
  });
  // Period dropdown toggles
  if (periodDropdown && periodDropdown.querySelector(".dropdown-toggle")) periodDropdown.querySelector(".dropdown-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    periodDropdown.classList.toggle("open");
  });
  document.addEventListener("click", () => {
    if (periodDropdown) periodDropdown.classList.remove("open");
  });
  // Accounts button is wired in accounts.js
  // if (openAccountsBtn && window.AccountsUI && window.AccountsUI.open) {
  //   openAccountsBtn.addEventListener("click", () => window.AccountsUI.open());
  // }

  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);

  // Notes save
  if (saveNotesBtn) saveNotesBtn.addEventListener("click", () => {
    Selectors.setNotes(notesArea.value.trim());
    notesSaved.textContent = "Сохранено";
    setTimeout(() => (notesSaved.textContent = ""), 1500);
  });

  // Notes sort (now only toggles label; in future for multiple notes)
  if (notesSort) {
    notesSort.addEventListener("change", () => {
      // Placeholder for future multi-note list sorting
      notesSaved.textContent = "Сортировка применена";
      setTimeout(() => (notesSaved.textContent = ""), 1000);
    });
  }

  // Notes tags
  const tags = new Set();
  function renderTags() {
    if (!notesTags) return;
    notesTags.innerHTML = "";
    [...tags].forEach(t => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = "#" + t;
      span.title = "Удалить тег";
      span.style.cursor = "pointer";
      span.addEventListener("click", () => { tags.delete(t); renderTags(); });
      notesTags.appendChild(span);
    });
  }
  if (addTagBtn && noteNewTag && notesTags) {
    addTagBtn.addEventListener("click", () => {
      const v = (noteNewTag.value || "").trim().replace(/^#/, "");
      if (!v) return;
      tags.add(v);
      noteNewTag.value = "";
      renderTags();
    });
  }

  // Add Trade
  if (addTradeBtn) {
    addTradeBtn.addEventListener("click", () => {
      const when = prompt("Дата закрытия (YYYY-MM-DD)", new Date().toISOString().slice(0,10));
      if (!when) return;
      const symbol = prompt("Инструмент (тикер)", "ES") || "ES";
      const strategy = prompt("Стратегия", "Breakout") || "Breakout";
      const r = Number(prompt("Результат в R (например 1.2, -0.5)", "1.0")) || 0;
      const pnl = Number(prompt("P&L (в валюте аккаунта)", "100")) || 0;
      const id = "t" + Math.random().toString(36).slice(2,9);
      DataStore.trades.push({
        id,
        accountId: Session.selectedAccountId,
        symbol,
        strategy,
        qty: 1,
        r,
        pnl,
        entryAt: when,
        exitAt: when
      });
      renderAll();
    });
  }

  if (addGoalBtn) addGoalBtn.addEventListener("click", () => {
    const title = prompt("Название цели");
    if (!title) return;
    const target = Number(prompt("Целевое значение (число)")) || 0;
    const unit = prompt("Единица (%, USD, trades, ...)", "%") || "%";
    const due = prompt("Дедлайн (YYYY-MM-DD)", "2025-12-31") || "2025-12-31";
    const goal = { id: "g" + Math.random().toString(36).slice(2,9), title, target, unit, progress: 0, due };
    Selectors.addGoal(goal);
    hydrateGoals();
  });

  // Pie tabs switching
  pieTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      pieTabButtons.forEach(b => b.classList.add("ghost"));
      btn.classList.remove("ghost");
      pieMode = btn.dataset.pie;
      renderPie();
    });
  });

  // Journal link placeholder
  if (journalLink) {
    journalLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "journal.html";
    });
  }

  // observe theme variable updates for charts
  const themeObserver = new MutationObserver(() => {
    // re-render charts to update theme colors
    refreshAllCharts();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  root.setAttribute("data-theme", next);
  document.body.style.transition = "background 0.3s";
  try { localStorage.setItem("tj.theme", next); } catch {}
}

function getFilteredTrades() {
  const all = Selectors.getTrades(Session.selectedAccountId);
  return filterTradesByPeriod(all, Session.period).sort((a, b) => new Date(a.exitAt || a.entryAt) - new Date(b.exitAt || b.entryAt));
}

function initCharts() {
  const equityCtx = document.getElementById("equityChart").getContext("2d");
  const winrateCtx = document.getElementById("winrateChart").getContext("2d");
  const pnlCtx = document.getElementById("pnlChart").getContext("2d");
  const pieCtx = document.getElementById("pieChart").getContext("2d");

  // seed minimal data to initialize
  equityChart = makeEquityChart(equityCtx, [], []);
  winrateChart = makeWinrateChart(winrateCtx, [], []);
  pnlChart = makePnlBars(pnlCtx, [], []);
  pieChart = makePie(pieCtx, [], []);
}

function refreshAllCharts() {
  // destroy and recreate to pick up theme colors
  equityChart.destroy();
  winrateChart.destroy();
  pnlChart.destroy();
  pieChart.destroy();
  initCharts();
  renderCharts();
}

function renderKpis(trades) {
  const acc = Selectors.getAccounts().find(a => a.id === Session.selectedAccountId) || Selectors.getAccounts()[0];
  const k = computeKpis(trades, acc?.startingEquity, acc?.currency || DataStore.currency);

  const fromToText = (() => {
    if (Session.period === "ALL") return "Всё время";
    if (Session.period === "YTD") return "С начала года";
    if (Session.period === "1D") return "Последний день";
    if (Session.period === "1W") return "Последняя неделя";
    if (Session.period === "1M") return "Последний месяц";
    if (Session.period === "3M") return "Последние 3 месяца";
    return "";
  })();
  equityDateRange.textContent = fromToText;

  setKpi(kEquityValue, kEquityDelta, fmtUtils.fmt.currency(k.equity, k.currency), k.deltas.equityDelta, (n)=>fmtUtils.fmt.currency(n, k.currency));
  setKpi(kWinRateValue, kWinRateDelta, fmtUtils.fmt.percent(k.winRate), k.deltas.winRateDelta, (n)=> (n*100).toFixed(1), "%");
  setKpi(kTradesCountValue, kTradesCountDelta, fmtUtils.fmt.number(k.count), k.deltas.countDelta, (n)=> n.toString());
  setKpi(kPnlValue, kPnlDelta, fmtUtils.fmt.currency(k.totalPnl, k.currency), k.deltas.pnlDelta, (n)=>fmtUtils.fmt.currency(n, k.currency));
}

function renderCharts() {
  const trades = getFilteredTrades();
  const acc = Selectors.getAccounts().find(a => a.id === Session.selectedAccountId) || Selectors.getAccounts()[0];

  // Equity curve: cumulative pnl + starting equity
  const sorted = trades.slice().sort((a,b) => new Date(a.exitAt || a.entryAt) - new Date(b.exitAt || b.entryAt));
  let running = acc?.startingEquity || 0;
  const equityLabels = [];
  const equityValues = [];
  for (const t of sorted) {
    running += t.pnl;
    equityLabels.push(t.exitAt || t.entryAt);
    equityValues.push(running);
  }
  updateChart(equityChart, equityLabels, equityValues);
  renderKpiSpark("equity", equityLabels, equityValues);

  // Winrate moving
  const wins = [];
  let cumWins = 0, cumCount = 0;
  const winrateSeries = [];
  for (let i = 0; i < sorted.length; i++) {
    cumCount += 1;
    if (sorted[i].pnl > 0) cumWins += 1;
    winrateSeries.push(cumWins / cumCount);
  }
  updateChart(winrateChart, equityLabels, winrateSeries, v => v * 100);
  renderKpiSpark("winrate", equityLabels, winrateSeries.map(v => v * 100));

  // PnL buckets (per period select)
  const bucketMap = new Map();
  for (const t of sorted) {
    const dt = new Date(t.exitAt || t.entryAt);
    let label;
    switch (Session.period) {
      case "1D": label = dt.toISOString().slice(11,16); break; // HH:MM for day (placeholder)
      case "1W": // fallthrough
      case "1M":
      case "3M":
      case "YTD":
      case "ALL":
      default:
        label = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    }
    bucketMap.set(label, (bucketMap.get(label) || 0) + t.pnl);
  }
  const pnlLabels = Array.from(bucketMap.keys()).sort();
  const pnlValues = pnlLabels.map(l => bucketMap.get(l));
  updateChart(pnlChart, pnlLabels, pnlValues);
  renderKpiSpark("pnl", pnlLabels, pnlValues);

  renderPie();
}

function renderPie() {
  const trades = getFilteredTrades();
  const distMap = new Map();
  if (pieMode === "strategy") {
    for (const t of trades) distMap.set(t.strategy, (distMap.get(t.strategy) || 0) + Math.max(0, t.pnl));
  } else {
    for (const t of trades) distMap.set(t.symbol, (distMap.get(t.symbol) || 0) + Math.max(0, t.pnl));
  }
  const labels = Array.from(distMap.keys());
  const values = labels.map(l => distMap.get(l));
  updateChart(pieChart, labels, values);
}

function renderRecent() {
  const trades = getFilteredTrades();
  const acc = Selectors.getAccounts().find(a => a.id === Session.selectedAccountId) || Selectors.getAccounts()[0];
  renderRecentTrades(recentTradesBody, trades, acc?.currency || DataStore.currency);
  // add row actions (Edit/Details)
  [...recentTradesBody.querySelectorAll("tr")].forEach((trEl, idx) => {
    let actionsCell = trEl.querySelector("td.actions");
    if (!actionsCell) {
      actionsCell = document.createElement("td");
      actionsCell.className = "actions";
      trEl.appendChild(actionsCell);
    } else {
      actionsCell.innerHTML = "";
    }
    const btn = document.createElement("button");
    btn.className = "btn xs ghost";
    btn.textContent = "Подробнее";
    btn.addEventListener("click", () => {
      const t = [...trades].slice(-8).reverse()[idx];
      if (!t) return;
      alert(`Сделка ${t.id}\nДата: ${t.exitAt || t.entryAt}\nИнструмент: ${t.symbol}\nСтратегия: ${t.strategy || "N/A"}\nR: ${t.r || 0}\nP&L: ${fmtUtils.fmt.currency(t.pnl || 0, acc?.currency || DataStore.currency)}`);
    });
    actionsCell.appendChild(btn);
  });
}

function renderAll() {
  const trades = getFilteredTrades();
  if (trades.length > 0) {
    renderKpis(trades);
    renderCharts();
  }
  renderRecent();
}

// Theme init from prefers-color-scheme
(function initTheme() {
  const root = document.documentElement;
  let theme = null;
  try { theme = localStorage.getItem("tj.theme"); } catch {}
  if (!theme) {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme = prefersDark ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);
})();

function ensureSparkCanvas(id) {
  const card = document.getElementById(id + "Value")?.closest(".card");
  if (!card) return null;
  let wrap = card.querySelector(".kpi-spark");
  if (!wrap) {
    const div = document.createElement("div");
    div.className = "kpi-spark";
    div.innerHTML = `<canvas id="${id}Spark"></canvas>`;
    card.appendChild(div);
    wrap = div;
  }
  return wrap.querySelector("canvas");
}

function renderKpiSpark(id, labels, values) {
  const canvas = ensureSparkCanvas(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const existing = canvas.__chart__;
  if (existing) existing.destroy();
  canvas.__chart__ = new window.Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data: values, borderColor: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(), backgroundColor: "transparent", pointRadius: 0, tension: 0.35 }] },
    options: {
      animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { borderWidth: 2 } }
    }
  });
}

// Expose initApp globally for index.html compatibility
window.initApp = init;

// Initialize the app
init();
route();
// Initialize the app
init();
route();
