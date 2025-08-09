/**
 * Utils: formatting, date helpers, aggregation
 */

export const fmt = {
  currency(n, currency = "USD") {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const sign = n < 0 ? "-" : "";
    const val = Math.abs(n);
    return `${sign}${val.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency}`;
  },
  percent(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return `${(n * 100).toFixed(1)}%`;
  },
  number(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toLocaleString("ru-RU");
  },
  signDelta(n, suffix = "") {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const s = n >= 0 ? "+" : "−";
    const abs = Math.abs(n);
    return `${s}${abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${suffix}`;
  }
};

export const date = {
  toISO(d) {
    if (typeof d === "string") return d.slice(0, 10);
    return new Date(d).toISOString().slice(0, 10);
  },
  parse(d) {
    return new Date(d);
  },
  addDays(d, days) {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + days);
    return nd;
  },
  startOfDay(d) {
    const nd = new Date(d);
    nd.setHours(0,0,0,0);
    return nd;
  },
  range(from, to) {
    const out = [];
    let cur = startOfDay(from);
    const end = startOfDay(to);
    while (cur <= end) {
      out.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    return out;
  }
};

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || []).concat(item));
  }
  return map;
}

export function sum(arr, sel = x => x) {
  return arr.reduce((acc, v) => acc + sel(v), 0);
}

export function movingWinRate(trades, window = 20) {
  const res = [];
  for (let i = 0; i < trades.length; i++) {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter(t => t.pnl > 0).length;
    res.push(slice.length ? wins / slice.length : 0);
  }
  return res;
}

export function bucketizeByPeriod(trades, period) {
  // Returns [{label, pnlSum, count, wins, losses}]
  const map = new Map();
  for (const t of trades) {
    const dt = new Date(t.exitAt || t.entryAt);
    let label;
    if (period === "1D") {
      label = dt.toISOString().slice(0,10);
    } else if (period === "1W") {
      // ISO week key: YYYY-Www
      const d = new Date(dt);
      const dayNum = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(d.getUTCFullYear(),0,4));
      const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3) / 7);
      label = `${d.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
    } else if (period === "1M" || period === "3M") {
      label = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    } else {
      // default monthly buckets for broader views
      label = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    }
    if (!map.has(label)) map.set(label, { label, pnlSum: 0, count: 0, wins: 0, losses: 0 });
    const rec = map.get(label);
    rec.pnlSum += t.pnl;
    rec.count += 1;
    if (t.pnl > 0) rec.wins += 1; else if (t.pnl < 0) rec.losses += 1;
  }
  return Array.from(map.values()).sort((a,b) => a.label.localeCompare(b.label));
}

// Export date functions individually for use in state.js
export const { startOfDay, addDays } = date;

export function filterByDateRange(trades, from, to) {
  if (!from && !to) return trades;
  const f = from ? new Date(from).getTime() : -Infinity;
  const t = to ? new Date(to).getTime() : Infinity;
  return trades.filter(tr => {
    const d = new Date(tr.exitAt || tr.entryAt).getTime();
    return d >= f && d <= t;
  });
}
