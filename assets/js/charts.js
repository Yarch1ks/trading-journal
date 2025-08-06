/**
 * Chart rendering module (Chart.js)
 * Exposes functions to create/update charts with consistent theming
 */

function baseGrid(color) {
  return {
    color: color,
    drawBorder: false,
    tickLength: 4
  };
}

function basePlugins(title) {
  return {
    legend: { display: false },
    tooltip: {
      mode: "index",
      intersect: false,
      backgroundColor: "rgba(15,23,42,0.9)",
      borderColor: "rgba(148,163,184,0.2)",
      borderWidth: 1,
      padding: 10
    },
    title: title ? { display: true, text: title } : undefined
  };
}

/**
 * Compute padded min/max for Y axis with dynamic buffer.
 * - Adds 5–10% padding depending on spread
 * - Avoids zero-height ranges by enforcing minimal span
 * - Clamps within finite bounds
 */
function paddedExtents(values, minPadRatio = 0.06, minSpan = 1, clamp = null) {
  const finite = values.map(Number).filter(v => Number.isFinite(v));
  if (!finite.length) return { suggestedMin: 0, suggestedMax: 1 };
  let vmin = Math.min(...finite);
  let vmax = Math.max(...finite);
  if (vmin === vmax) {
    vmin -= minSpan / 2;
    vmax += minSpan / 2;
  }
  const span = Math.max(vmax - vmin, minSpan);
  const pad = Math.max(span * minPadRatio, span * 0.05);
  let outMin = vmin - pad;
  let outMax = vmax + pad;
  if (clamp && typeof clamp.min === "number") outMin = Math.max(outMin, clamp.min);
  if (clamp && typeof clamp.max === "number") outMax = Math.min(outMax, clamp.max);
  // ensure not equal after clamp
  if (outMax - outMin < minSpan) {
    const mid = (outMax + outMin) / 2;
    outMin = mid - minSpan / 2;
    outMax = mid + minSpan / 2;
  }
  return { suggestedMin: outMin, suggestedMax: outMax };
}

/**
 * Ensure labels fill available width when few points (auto-fill).
 * Repeats last label to reach at least targetCount.
 */
function autofillSeries(labels, values, targetCount = 8) {
  const L = labels.length;
  if (L >= targetCount) return { labels, values };
  const filledLabels = labels.slice();
  const filledValues = values.slice();
  const lastLabel = labels[L - 1] ?? "";
  const lastValue = values[L - 1] ?? 0;
  while (filledLabels.length < targetCount) {
    filledLabels.push(lastLabel);
    filledValues.push(lastValue);
  }
  return { labels: filledLabels, values: filledValues };
}

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue("--primary").trim() || "#2563eb",
    green: styles.getPropertyValue("--green").trim() || "#10b981",
    red: styles.getPropertyValue("--red").trim() || "#ef4444",
    text: styles.getPropertyValue("--text").trim() || "#0f172a",
    border: styles.getPropertyValue("--border").trim() || "#e5e7eb",
    elev2: styles.getPropertyValue("--elev-2").trim() || "#fff"
  };
}

export function makeEquityChart(ctx, labels, values) {
  const c = themeColors();
  // auto-fill только при создании
  const filled = autofillSeries(labels, values, 8);
  const yPad = paddedExtents(filled.values, 0.08, 1, { min: 0 }); // equity не ниже 0
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: filled.labels,
      datasets: [{
        label: "Equity",
        data: filled.values,
        fill: true,
        borderColor: c.primary,
        backgroundColor: c.primary + "22",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        cubicInterpolationMode: "monotone"
      }]
    },
    options: {
      animation: { duration: 0 },
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2, // стабильно вписывается и не «тянет» контейнер
      layout: { padding: 10 },
      scales: {
        x: { grid: baseGrid(c.border), ticks: { color: c.text, maxRotation: 0, autoSkip: true } },
        y: { 
          grid: baseGrid(c.border), 
          ticks: { color: c.text },
          beginAtZero: false,
          suggestedMin: yPad.suggestedMin,
          suggestedMax: yPad.suggestedMax
        }
      },
      plugins: basePlugins()
    }
  });
}

export function makeWinrateChart(ctx, labels, values) {
  const c = themeColors();
  const pct = values.map(v => v * 100);
  const filled = autofillSeries(labels, pct, 8);
  const pad = paddedExtents(
    filled.values.map(v => Math.min(100, Math.max(0, v))),
    0.06, 5, { min: 0, max: 100 }
  );
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: filled.labels,
      datasets: [{
        label: "Win Rate",
        data: filled.values,
        borderColor: c.green,
        backgroundColor: c.green + "22",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        fill: true,
        cubicInterpolationMode: "monotone"
      }]
    },
    options: {
      animation: { duration: 0 },
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      layout: { padding: 10 },
      scales: {
        x: { grid: baseGrid(c.border), ticks: { color: c.text } },
        y: { 
          grid: baseGrid(c.border), 
          ticks: { color: c.text, callback: v => v + "%" },
          beginAtZero: true,
          suggestedMin: pad.suggestedMin,
          suggestedMax: pad.suggestedMax
        }
      },
      plugins: basePlugins()
    }
  });
}

export function makePnlBars(ctx, labels, pnlValues) {
  const c = themeColors();
  const filled = autofillSeries(labels, pnlValues, 8);
  // симметричный буфер вокруг нуля
  const absMax = Math.max(1, ...filled.values.map(v => Math.abs(v)));
  const span = absMax * 2;
  const pad = Math.max(span * 0.08, 1);
  const yPad = { suggestedMin: -absMax - pad, suggestedMax: absMax + pad };
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: filled.labels,
      datasets: [{
        label: "P&L",
        data: filled.values,
        backgroundColor: filled.values.map(v => v >= 0 ? c.green + "cc" : c.red + "cc"),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.6
      }]
    },
    options: {
      animation: { duration: 0 },
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      layout: { padding: 10 },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text } },
        y: { 
          grid: baseGrid(c.border), 
          ticks: { color: c.text },
          beginAtZero: false,
          suggestedMin: yPad.suggestedMin,
          suggestedMax: yPad.suggestedMax
        }
      },
      plugins: basePlugins()
    }
  });
}

export function makePie(ctx, labels, values) {
  const c = themeColors();
  const palette = [
    c.primary, c.green, "#7c3aed", "#f59e0b", "#06b6d4", "#ef4444", "#22c55e", "#8b5cf6"
  ];
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => palette[i % palette.length]),
        borderColor: "transparent"
      }]
    },
    options: {
      cutout: "60%",
      animation: { duration: 0 },
      plugins: { legend: { display: false }, tooltip: basePlugins().tooltip }
    }
  });
}

export function updateChart(chart, labels, values, mapper = v => v) {
  // На update не делаем auto-fill, чтобы не сдвигать визуальную базу
  const newLabels = labels;
  const newValues = values.map(mapper);
  chart.data.labels = newLabels;
  chart.data.datasets[0].data = newValues;

  if (chart.config.type === "bar") {
    const c = themeColors();
    // симметричный диапазон вокруг нуля
    const absMax = Math.max(1, ...newValues.map(v => Math.abs(v)));
    const span = absMax * 2;
    const pad = Math.max(span * 0.08, 1);
    chart.options.scales.y.suggestedMin = -absMax - pad;
    chart.options.scales.y.suggestedMax = absMax + pad;
    chart.data.datasets[0].backgroundColor = newValues.map(v => v >= 0 ? c.green + "cc" : c.red + "cc");
  } else if (chart.config.type === "line") {
    const clamp = chart.data.datasets[0].label === "Win Rate" ? { min: 0, max: 100 } : { min: 0 };
    const pad = paddedExtents(newValues, 0.08, 1, clamp);
    if (chart.options.scales?.y) {
      chart.options.scales.y.suggestedMin = pad.suggestedMin;
      chart.options.scales.y.suggestedMax = pad.suggestedMax;
    }
  }

  // поддерживаем аккуратный апдейт без дерганья
  chart.update("active");
}
