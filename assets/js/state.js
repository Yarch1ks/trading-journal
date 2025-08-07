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
  const { data, error } = await window.supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id;
}

export async function listTrades({ accountId, limit = 100, offset = 0 } = {}) {
  const uid = await getUserId();
  let q = window.supabase.from("trades").select("*").eq("user_id", uid).order("executed_at", { ascending: false });
  if (accountId) q = q.eq("metadata->>accountId", accountId);
  if (limit) q = q.range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  // map DB rows to UI model
  return (data || []).map(r => ({
    id: r.id,
    accountId: r.metadata?.accountId || null,
    symbol: r.symbol,
    strategy: r.metadata?.strategy || "",
    qty: Number(r.qty) || 1,
    r: r.metadata?.r ?? 0,
    pnl: Number(r.pnl ?? 0),
    entryAt: r.executed_at?.slice(0, 10) || null,
    exitAt: r.executed_at?.slice(0, 10) || null,
    fees: Number(r.fees ?? 0),
    notes: r.notes || "",
    tags: Array.isArray(r.metadata?.tags) ? r.metadata.tags : []
  }));
}

export async function createTrade(ui) {
  const uid = await getUserId();
  const row = {
    user_id: uid,
    executed_at: ui.exitAt ? new Date(ui.exitAt).toISOString() : new Date().toISOString(),
    symbol: ui.symbol,
    side: (ui.side === "short" ? "sell" : "buy"),
    qty: ui.qty ?? 1,
    price: ui.entryPrice ?? 0,
    fees: ui.fees ?? 0,
    pnl: ui.pnl ?? 0,
    notes: ui.notes || "",
    metadata: {
      accountId: ui.accountId || null,
      strategy: ui.strategy || "",
      r: ui.r ?? 0,
      tags: ui.tags || []
    }
  };
  const { data, error } = await window.supabase.from("trades").insert(row).select().single();
  if (error) throw error;
  return data.id;
}

export async function updateTrade(id, ui) {
  const row = {
    executed_at: ui.exitAt ? new Date(ui.exitAt).toISOString() : new Date().toISOString(),
    symbol: ui.symbol,
    side: (ui.side === "short" ? "sell" : "buy"),
    qty: ui.qty ?? 1,
    price: ui.entryPrice ?? 0,
    fees: ui.fees ?? 0,
    pnl: ui.pnl ?? 0,
    notes: ui.notes || "",
    metadata: {
      accountId: ui.accountId || null,
      strategy: ui.strategy || "",
      r: ui.r ?? 0,
      tags: ui.tags || []
    }
  };
  const { error } = await window.supabase.from("trades").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTrade(id) {
  const { error } = await window.supabase.from("trades").delete().eq("id", id);
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
