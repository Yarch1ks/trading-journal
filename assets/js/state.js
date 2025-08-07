/**
 * State module:
 * - Holds in-memory data store (can be replaced with real persistence later)
 * - Exposes selectors for accounts, trades, goals, notes
 * - Provides filtering by account and period
 */

import { bucketizeByPeriod, filterByDateRange, groupBy, sum } from "./utils.js";

export const DataStore = {
  currency: "USD",
  accounts: [
    { id: "acc-1", name: "Main Futures", currency: "USD", startingEquity: 10000 },
    { id: "acc-2", name: "Crypto Swing", currency: "USD", startingEquity: 5000 }
  ],
  // trades теперь загружаются из Supabase
  trades: [],
  goals: [
    { id: "g1", title: "Win Rate 55%+", target: 55, unit: "%", progress: 48, due: "2025-09-01" },
    { id: "g2", title: "Monthly P&L +$1,000", target: 1000, unit: "USD", progress: 620, due: "2025-08-31" },
    { id: "g3", title: "Max 3 trades/day", target: 3, unit: "trades", progress: 4, due: "2025-12-31" }
  ],
  notes: "Следить за качеством входов. Не увеличивать риск без подтверждения."
};

// UI session state
export const Session = {
  selectedAccountId: DataStore.accounts[0]?.id || null,
  period: "ALL",
  notes: DataStore.notes
};

// Selectors and aggregations
export const Selectors = {
  getAccounts() {
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
  // map DB rows to UI model expected by journal (keep fields journal.js uses)
  return (data || []).map(r => ({
    id: r.id,
    accountId: r.account || null,
    symbol: r.pair || "",
    strategy: "", // no strategy in new schema
    qty: 1, // not used in UI KPIs now
    r: Number(r.rr ?? 0),
    pnl: Number(r.net_result_usd ?? 0),
    entryAt: r.started_at ? String(r.started_at).slice(0, 10) : null,
    exitAt: r.ended_at ? String(r.ended_at).slice(0, 10) : r.started_at ? String(r.started_at).slice(0, 10) : null,
    fees: 0,
    notes: r.notes || "",
    tags: []
  }));
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
  return data.id;
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
  const { error } = await client.from("trades_new").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTrade(id) {
  const client = window.supabaseClient || (window.auth && window.auth.supabase);
  const { error } = await client.from("trades_new").delete().eq("id", id);
  if (error) throw error;
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
    from = new Date(now); from.setDate(now.getDate() - 1);
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
