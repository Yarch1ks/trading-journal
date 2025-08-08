/**
 * UI Components module
 * Contains reusable rendering functions for dashboard widgets
 */

import { fmt } from "./utils.js";

/**
 * Render recent trades table
 * @param {HTMLElement} container - tbody element
 * @param {Array} trades - array of trade objects
 * @param {string} currency - currency symbol
 */
export function renderRecentTrades(container, trades, currency = "USD") {
  container.innerHTML = trades.slice(0, 8).map(trade => `
    <tr>
      <td>${fmt.date.toISO(trade.exitAt || trade.entryAt)}</td>
      <td>${trade.symbol || ""}</td>
      <td>${trade.strategy || ""}</td>
      <td class="${(trade.r || 0) >= 0 ? "r-pos" : "r-neg"}">${(trade.r || 0).toFixed(2)}R</td>
      <td class="${(trade.pnl || 0) >= 0 ? "r-pos" : "r-neg"}">${fmt.currency(trade.pnl || 0, currency)}</td>
    </tr>
  `).join("");
}

/**
 * Render goals list
 * @param {HTMLElement} container - ul element
 * @param {Array} goals - array of goal objects
 * @param {Object} options - configuration options
 */
export function renderGoals(container, goals, options = {}) {
  container.innerHTML = goals.map(goal => {
    const progress = goal.progress || 0;
    const target = goal.target || 0;
    const unit = goal.unit || "%";
    const due = goal.due ? new Date(goal.due).toLocaleDateString("ru-RU") : "";
    const progressPercent = target ? Math.min(100, (progress / target) * 100) : 0;
    const isOverdue = new Date(goal.due) < new Date() && progressPercent < 100;
    
    return `
      <li class="goal-item ${isOverdue ? 'overdue' : ''}" data-id="${goal.id}">
        <div class="goal-top">
          <div class="goal-title">
            <span>${goal.title || "Без названия"}</span>
          </div>
          <div class="goal-actions">
            <span class="goal-progress">${progress.toFixed(1)}${unit} / ${target}${unit}</span>
          </div>
        </div>
        <div class="goal-meta">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <span class="goal-due">${due ? `Дедлайн: ${due}` : ""}</span>
        </div>
      </li>
    `;
  }).join("");

  // Add event listeners for progress changes if handler provided
  if (options.onProgressChange) {
    container.querySelectorAll(".goal-item").forEach(item => {
      const goalId = item.dataset.id;
      const progressBar = item.querySelector(".progress-fill");
      
      progressBar.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newProgress = (clickX / rect.width) * 100;
        options.onProgressChange(goalId, newProgress);
      });
    });
  }
}

/**
 * Set KPI value with delta indicator
 * @param {HTMLElement} valueEl - element for main value
 * @param {HTMLElement} deltaEl - element for delta
 * @param {string} value - main value text
 * @param {number} delta - delta value
 * @param {Function} formatter - function to format numbers
 * @param {string} suffix - suffix for delta
 */
export function setKpi(valueEl, deltaEl, value, delta, formatter = (n) => n, suffix = "") {
  if (valueEl) valueEl.textContent = value;
  
  if (deltaEl && delta !== undefined && delta !== null) {
    const deltaText = delta >= 0 ? `+${formatter(delta)}${suffix}` : `${formatter(delta)}${suffix}`;
    const deltaClass = delta >= 0 ? "delta-pos" : "delta-neg";
    deltaEl.textContent = deltaText;
    deltaEl.className = `kpi-delta ${deltaClass}`;
  } else if (deltaEl) {
    deltaEl.textContent = "";
    deltaEl.className = "kpi-delta";
  }
}

/**
 * Render notes section
 * @param {HTMLElement} container - textarea element
 * @param {string} notes - notes text
 * @param {Object} options - configuration options
 */
export function renderNotes(container, notes, options = {}) {
  if (container) {
    container.value = notes || "";
    container.placeholder = options.placeholder || "Идеи, сетапы, наблюдения...";
  }
}

/**
 * Render tags section
 * @param {HTMLElement} container - div element for tags
 * @param {Array} tags - array of tag strings
 * @param {Object} options - configuration options
 */
export function renderTags(container, tags, options = {}) {
  if (!container) return;
  
  container.innerHTML = tags.map(tag => `
    <span class="tag">${tag}</span>
  `).join("");
}
