/**
 * UI components: rendering and DOM helpers
 */

import { fmt } from "./utils.js";

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const ch of children) {
    if (ch == null) continue;
    if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
    else node.appendChild(ch);
  }
  return node;
}

export function renderRecentTrades(tbody, trades, currency) {
  tbody.innerHTML = "";
  const last = trades.slice(-8).reverse(); // last 8
  for (const t of last) {
    const tr = el("tr", {}, 
      el("td", {}, t.exitAt || t.entryAt),
      el("td", {}, t.symbol),
      el("td", {}, t.strategy),
      el("td", { class: t.r >= 0 ? "r-pos" : "r-neg" }, (t.r >= 0 ? "+" : "−") + Math.abs(t.r).toFixed(2)),
      el("td", { class: t.pnl >= 0 ? "r-pos" : "r-neg" }, (t.pnl >= 0 ? "+" : "−") + fmt.currency(Math.abs(t.pnl), currency))
    );
    tbody.appendChild(tr);
  }
}

export function renderGoals(listEl, goals, { onProgressChange } = {}) {
  listEl.innerHTML = "";
  for (const g of goals) {
    const pct = Math.max(0, Math.min(100, g.unit === "%" ? g.progress : (g.progress / (g.target || 1)) * 100));
    const item = el("li", { class: "goal-item" },
      el("div", { class: "goal-top" },
        el("div", {},
          el("div", { class: "goal-title" }, g.title),
          el("div", { class: "goal-meta" }, `Цель: ${g.target} ${g.unit} • Дедлайн: ${g.due}`)
        ),
        el("div", {},
          el("input", {
            type: "number",
            value: g.progress,
            style: "width:88px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--elev-1);color:var(--text);"
          }),
          el("button", { class: "btn xs ghost", onClick: (e) => {
            const input = e.currentTarget.previousSibling;
            const val = Number(input.value);
            if (onProgressChange) onProgressChange(g.id, isNaN(val) ? 0 : val);
          } }, "Обновить")
        )
      ),
      el("div", { class: "progress" },
        el("span", { style: `width:${pct.toFixed(0)}%` })
      ),
      el("div", { class: "goal-meta" }, `Прогресс: ${g.progress} ${g.unit} (${pct.toFixed(0)}%)`)
    );
    listEl.appendChild(item);
  }
}

export function setKpi(elValue, elDelta, valueStr, deltaNum, formatter = (x)=>x, deltaSuffix = "") {
  elValue.textContent = valueStr;
  if (deltaNum === 0 || deltaNum == null || isNaN(deltaNum)) {
    elDelta.textContent = "—";
    elDelta.className = "kpi-delta";
  } else {
    elDelta.textContent = (deltaNum >= 0 ? "+" : "−") + formatter(Math.abs(deltaNum)) + deltaSuffix;
    elDelta.className = "kpi-delta " + (deltaNum >= 0 ? "pos" : "neg");
  }
}
