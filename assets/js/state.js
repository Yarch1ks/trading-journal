/**
 * State module:
 * - Holds in-memory data store (can be replaced with real persistence later)
 * - Exposes selectors for accounts, trades, goals, notes
 * - Provides filtering by account and period
 */

import { bucketizeByPeriod, filterByDateRange, groupBy, sum } from "./utils.js";

export const DataStore = {
  currency: "USD",
  // Реальный список аккаунтов будет загружен из Supabase
  accounts: [],
  // trades теперь загружаются из Supabase
  trades: [],
  goals: [
    { id: "g1", title: "Win Rate 55%+", target: 55, unit: "%", progress: 48, due: "2025-09-01" },
    { id: "g2", title: "Monthly P&L +$1,000", target: 1000, unit: "USD", progress: 620, due: "2025-08-31" },
    { id: "g3", title: "Max 3 trades/day", target: 3, unit: "trades", progress: 4, due: "2025-12-31" }
  ],
  notes: "Следить за качеством входов. Не увеличивать риск без подтверждения."
};

// Cross-tab synchronization for trades
const TradeSync = (() => {
  const channel = window.BroadcastChannel ? new BroadcastChannel("tj-sync") : null;

  function handle(message) {
    if (!message || !message.type) return;
    if (message.type === "set" && Array.isArray(message.trades)) {
      DataStore.trades = message.trades;
    } else if (message.type === "create" && message.trade) {
      DataStore.trades.unshift(message.trade);
    } else if (message.type === "update" && message.trade) {
      const idx = DataStore.trades.findIndex(t => t.id === message.trade.id);
      if (idx >= 0) {
        DataStore.trades[idx] = { ...DataStore.trades[idx], ...message.trade };
      } else {
        DataStore.trades.unshift(message.trade);
      }
    } else if (message.type === "delete" && message.id) {
      const idx = DataStore.trades.findIndex(t => t.id === message.id);
      if (idx >= 0) DataStore.trades.splice(idx, 1);
    }
    document.dispatchEvent(new CustomEvent("tj.trades.changed", { detail: message }));
  }

  if (channel) {
    channel.addEventListener("message", e => handle(e.data));
  } else {
    window.addEventListener("storage", e => {
      if (e.key === "tj-sync" && e.newValue) {
        try { handle(JSON.parse(e.newValue)); } catch {}
      }
    });
  }

  function post(message) {
    try {
      if (channel) {
        channel.postMessage(message);
      } else {
        localStorage.setItem("tj-sync", JSON.stringify({ ...message, _ts: Date.now() }));
      }
    } catch {}
  }

  return { post };
})();

// UI session state
export const Session = {
  selectedAccountId: DataStore.accounts[0]?.id || null,
  period: "ALL",
  notes: DataStore.notes
};

// Глобальный выбор аккаунта + событие для кросс-страничной синхронизации
export function setSelectedAccount(id) {
  Session.selectedAccountId = id || null;
  try { localStorage.setItem("tj.selectedAccountId", id || ""); } catch {}
  // уведомить все страницы/скрипты
  document.dispatchEvent(new CustomEvent("tj.account.selected", { detail: { id } }));
}

// Runtime event helpers (lightweight bus)
export const Events = {
  emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  },
  on(name, handler) {
    document.addEventListener(name, handler);
    return () => document.removeEventListener(name, handler);
  }
};

// Selectors and aggregations
export const Selectors = {
  getAccounts() {
    return DataStore.accounts;
  },
  // Явная подгрузка аккаунтов из Supabase и обновление Session/DataStore
  async refreshAccountsFromSupabase() {
    const client = window.supabaseClient || (window.auth && window.auth.supabase);
    if (!client) throw new Error("Supabase client is not initialized");
    const { data, error } = await client
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;

    // Нормализация полей под UI
    DataStore.accounts = (data || []).map(a => ({
      id: a.id || a.slug || a.name,
      name: a.name || a.slug || "Account",
      currency: a.currency || "USD",
      startingEquity: Number(a.starting_equity ?? a.starting_balance ?? a.balance ?? 0)
    }));

    // Инициализация выбранного аккаунта
    try {
      const saved = localStorage.getItem("tj.selectedAccountId");
      if (saved && DataStore.accounts.find(x => x.id === saved)) {
        Session.selectedAccountId = saved;
      } else {
        Session.selectedAccountId = DataStore.accounts[0]?.id || null;
      }
    } catch {
      Session.selectedAccountId = DataStore.accounts[0]?.id || null;
    }

    // уведомим подписчиков (журнал/дашборд/аналитика)
    document.dispatchEvent(new CustomEvent("tj.accounts.changed", { detail: { accounts: DataStore.accounts, selectedId: Session.selectedAccountId } }));
    return DataStore.accounts;
  },
  getTrades(accountId) {
    return DataStore.trades.filter(t => !accountId || t.accountId === accountId);
  },
  getGoals() {
    return DataStore.goals;
  },
  getNotes() {
    return Session.notes;
  },
  setNotes(text) {
    Session.notes = text;
  },
  addGoal(goal) {
    DataStore.goals.unshift(goal);
  },
  updateGoalProgress(id, progress) {
    const g = DataStore.goals.find(x => x.id === id);
    if (g) g.progress = progress;
  }
};

// -------- Supabase CRUD wrappers (public.trades) --------
async function getUserId() {
  // Ensure client exists (auth.js must run before this file)
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  if (!client || !client.auth) {
    throw new Error("Supabase client is not initialized on window (auth.js must load before state.js)");
  }
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data?.user?.id;
}

function mapRowToTrade(r) {
  return {
    id: r.id,
    accountId: r.account || null,
    symbol: r.pair || "",
    strategy: "",
    qty: 1,
    r: Number(r.rr ?? 0),
    pnl: Number(r.net_result_usd ?? 0),
    entryAt: r.started_at ? String(r.started_at).slice(0, 10) : null,
    exitAt: r.ended_at ? String(r.ended_at).slice(0, 10) : r.started_at ? String(r.started_at).slice(0, 10) : null,
    fees: 0,
    notes: r.notes || "",
    tags: []
  };
}

export async function listTrades({ accountId, limit = 100, offset = 0 } = {}) {
  const uid = await getUserId();
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  // trades_new schema
  let q = client
    .from("trades_new")
    .select("*")
    .eq("user_id", uid)
    .order("started_at", { ascending: false });
  if (accountId) q = q.eq("account", accountId);
  if (limit) q = q.range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  const mapped = (data || []).map(mapRowToTrade);
  // Обновляем хранилище без прямого присваивания
  const existingIds = new Set(DataStore.trades.map(t => t.id));
  const newTrades = mapped.filter(t => !existingIds.has(t.id));
  DataStore.trades = [...newTrades, ...DataStore.trades.filter(t => existingIds.has(t.id))];
  TradeSync.post({ type: "set", trades: DataStore.trades });
  document.dispatchEvent(new CustomEvent("tj.trades.changed", { detail: { accountId, count: DataStore.trades.length } }));
  return DataStore.trades;
}

export async function createTrade(ui) {
  const uid = await getUserId();
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  const row = {
    user_id: uid,
    started_at: ui.entryAt ? new Date(ui.entryAt).toISOString() : new Date().toISOString(),
    ended_at: ui.exitAt ? new Date(ui.exitAt).toISOString() : null,
    account: ui.accountId || "Main",
    direction: (ui.side === "short" ? "short" : "long"),
    session: ui.session || "ASIA",
    pair: ui.symbol || "",
    result: ui.result || (Number(ui.pnl || 0) > 0 ? "win" : Number(ui.pnl || 0) === 0 ? "be" : "loss"),
    rr: ui.r ?? 0,
    risk_pct: ui.riskPct ?? 0,
    risk_amount_usd: ui.riskAmountUsd ?? 0,
    notes: ui.notes || ""
  };
  const { data, error } = await client.from("trades_new").insert(row).select().single();
  if (error) throw error;
  const trade = mapRowToTrade(data);
  // Используем иммутабельное добавление
  DataStore.trades = [trade, ...DataStore.trades];
  TradeSync.post({ type: "create", trade });
  document.dispatchEvent(new CustomEvent("tj.trades.changed", { detail: { type: "create", id: trade.id, accountId: trade.accountId } }));
  return trade.id;
}

export async function updateTrade(id, ui) {
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  // Build patch only with provided fields to avoid CHECK violations
  const patch = {};
  if (ui.entryAt) patch.started_at = new Date(ui.entryAt).toISOString();
  if (ui.exitAt !== undefined) patch.ended_at = ui.exitAt ? new Date(ui.exitAt).toISOString() : null;
  if (ui.accountId) patch.account = ui.accountId;
  if (ui.side) patch.direction = (ui.side === "short" ? "short" : "long");
  if (ui.session) patch.session = ui.session;
  if (ui.symbol) patch.pair = ui.symbol;
  if (ui.result) patch.result = ui.result;
  if (ui.r !== undefined) patch.rr = ui.r ?? 0;
  if (ui.riskPct !== undefined) patch.risk_pct = ui.riskPct ?? 0;
  if (ui.riskAmountUsd !== undefined) patch.risk_amount_usd = ui.riskAmountUsd ?? 0;
  if (ui.notes !== undefined) patch.notes = ui.notes || "";
  // НЕ включаем net_result_usd в патч, так как это вычисляемое поле
  const { error } = await client.from("trades_new").update(patch).eq("id", id);
  if (error) throw error;
  const localPatch = { id };
  if (ui.entryAt) localPatch.entryAt = ui.entryAt;
  if (ui.exitAt !== undefined) localPatch.exitAt = ui.exitAt || null;
  if (ui.accountId) localPatch.accountId = ui.accountId;
  if (ui.symbol) localPatch.symbol = ui.symbol;
  if (ui.r !== undefined) localPatch.r = ui.r;
  if (ui.notes !== undefined) localPatch.notes = ui.notes;
  // Используем иммутабельное обновление
  DataStore.trades = DataStore.trades.map(t => 
    t.id === id ? { ...t, ...localPatch } : t
  );
  TradeSync.post({ type: "update", trade: localPatch });
  document.dispatchEvent(new CustomEvent("tj.trades.changed", { detail: { type: "update", id } }));
}

export async function deleteTrade(id) {
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  const { error } = await client.from("trades_new").delete().eq("id", id);
  if (error) throw error;
  // Используем иммутабельное удаление
  DataStore.trades = DataStore.trades.filter(t => t.id !== id);
  TradeSync.post({ type: "delete", id });
  document.dispatchEvent(new CustomEvent("tj.trades.changed", { detail: { type: "delete", id } }));
}

let tradesChannel = null;

export function subscribeToTrades() {
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  if (!client || !client.channel) return null;

  if (tradesChannel) try { tradesChannel.unsubscribe(); } catch {}

  tradesChannel = client
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trades_new' }, payload => {
      const evt = payload.eventType;
      if (evt === 'DELETE') {
        const id = payload.old?.id;
        if (id) {
          DataStore.trades = DataStore.trades.filter(t => t.id !== id);
          document.dispatchEvent(new CustomEvent('tj.trades.changed', { detail: { type: 'delete', id } }));
        }
        return;
      }

      const r = payload.new;
      if (!r) return;
      const trade = {
        id: r.id,
        accountId: r.account || null,
        symbol: r.pair || '',
        strategy: '',
        qty: 1,
        r: Number(r.rr ?? 0),
        pnl: Number(r.net_result_usd ?? 0),
        entryAt: r.started_at ? String(r.started_at).slice(0, 10) : null,
        exitAt: r.ended_at ? String(r.ended_at).slice(0, 10) : r.started_at ? String(r.started_at).slice(0, 10) : null,
        fees: 0,
        notes: r.notes || '',
        tags: []
      };
      const idx = DataStore.trades.findIndex(t => t.id === trade.id);
      if (idx >= 0) DataStore.trades[idx] = trade; else DataStore.trades.unshift(trade);
      document.dispatchEvent(new CustomEvent('tj.trades.changed', { detail: { type: evt.toLowerCase(), id: trade.id } }));
    })
    .subscribe();

  window.addEventListener('beforeunload', () => {
    try { tradesChannel.unsubscribe(); } catch {}
  }, { once: true });

  return tradesChannel;
}

export function computeKpis(trades, startingEquity, currency) {
  const totalPnl = sum(trades, t => t.pnl);
  const equity = (startingEquity || 0) + totalPnl;
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const count = trades.length;
  const winRate = count ? wins / count : 0;

  // Simple delta vs previous equal-sized window (if available)
  let prevDelta = { equityDelta: 0, winRateDelta: 0, countDelta: 0, pnlDelta: 0 };
  if (trades.length > 2) {
    const half = Math.floor(trades.length / 2);
    const cur = trades.slice(half);
    const prev = trades.slice(0, half);
    prevDelta = {
      equityDelta: sum(cur, t => t.pnl) - sum(prev, t => t.pnl),
      winRateDelta: (cur.filter(t => t.pnl > 0).length / (cur.length || 1)) - (prev.filter(t => t.pnl > 0).length / (prev.length || 1)),
      countDelta: cur.length - prev.length,
      pnlDelta: sum(cur, t => t.pnl) - sum(prev, t => t.pnl)
    };
  }

  // Buckets for pnl chart
  const buckets = bucketizeByPeriod(trades, "AUTO");

  // Distribution by strategy/symbol
  const byStrategy = Array.from(groupBy(trades, t => t.strategy).entries()).map(([k, arr]) => ({ key: k, value: sum(arr, x => x.pnl) }));
  const bySymbol = Array.from(groupBy(trades, t => t.symbol).entries()).map(([k, arr]) => ({ key: k, value: sum(arr, x => x.pnl) }));

  return {
    equity,
    totalPnl,
    winRate,
    count,
    deltas: prevDelta,
    currency: currency || "USD",
    buckets,
    byStrategy,
    bySymbol
  };
}

export function filterTradesByPeriod(trades, period) {
  if (period === "ALL") return trades;
  const now = new Date();
  let from;
  if (period === "1D") {
    from = startOfDay(now); // Используем утилиту для начала дня
  } else if (period === "1W") {
    from = new Date(now); from.setDate(now.getDate() - 7);
  } else if (period === "1M") {
    from = new Date(now); from.setMonth(now.getMonth() - 1);
  } else if (period === "3M") {
    from = new Date(now); from.setMonth(now.getMonth() - 3);
  } else if (period === "YTD") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    return trades;
  }
  return filterByDateRange(trades, from, now);
}
