/**
 * Charts management using Chart.js for Sagemcom Watcher.
 */

import { state } from "./state.js";
import {
  getStarredColor,
  normalizeData,
  getFilteredHistoryAndIndices,
  getStarIconSVG,
  formatDisplayValue,
  replaceSpecialChars,
  formatTimeLabel,
} from "./utils.js";

// Synced crosshair plugin
const syncedCrosshairPlugin = {
  id: "syncedCrosshair",
  afterDraw(chart) {
    if (
      state.globalCrosshairIndex < 0 ||
      state.globalCrosshairIndex >= chart.data.labels.length
    ) {
      return;
    }
    const ctx = chart.ctx;
    const xScale = chart.scales["x"];
    if (!xScale) return;
    const x = xScale.getPixelForValue(state.globalCrosshairIndex);
    const { top, bottom } = chart.chartArea;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(88, 166, 255, 0.6)";
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(syncedCrosshairPlugin);

// Broadcast crosshair index to visible charts only (performance).
export function setCrosshairIndex(index) {
  state.globalCrosshairIndex = index;
  // Only redraw charts currently in the viewport
  state.visibleChartKeys.forEach((key) => {
    if (state.chartsInstanceMap[key]) state.chartsInstanceMap[key].draw();
  });
  Object.values(state.starredChartsInstanceMap).forEach((ch) => ch.draw());
  if (state.modalChartInstance) state.modalChartInstance.draw();
  if (state.comparisonChartInstance) state.comparisonChartInstance.draw();
}

export function prepareChartData(key, cachedFilter) {
  const meta = state.keyMetadata[key];
  const { historySlice, indices } =
    cachedFilter || getFilteredHistoryAndIndices();
  const sliceLength = historySlice.length;

  const showDate = historySlice.length > 0 &&
    (new Date(historySlice[historySlice.length - 1].timestamp) - new Date(historySlice[0].timestamp) > 24 * 3600 * 1000);
  const labels = historySlice.map((item) => formatTimeLabel(item.timestamp, showDate));

  let data = [];
  if (meta.isConstant) {
    let val = meta.latestValue;
    if (meta.type === "boolean") {
      val = val ? 1 : 0;
    } else if (meta.type === "string") {
      state.cardLookupMap[key] = [val];
      val = 0;
    }
    data = Array(sliceLength).fill(val);
  } else {
    const slicedValues = meta.values
      ? indices.map((idx) => meta.values[idx])
      : [];
    if (meta.type === "boolean") {
      data = slicedValues.map((v) => (v === null ? null : v ? 1 : 0));
    } else if (meta.type === "string") {
      const uniqueStrings = Array.from(
        new Set(slicedValues.filter((v) => v !== null))
      );
      data = slicedValues.map((v) => {
        if (v === null) return null;
        return uniqueStrings.indexOf(v);
      });
      state.cardLookupMap[key] = uniqueStrings;
    } else {
      data = slicedValues;
    }
  }

  return { labels, data };
}

export function renderComparisonChart() {
  const canvas = document.getElementById("comparison-canvas");
  if (!canvas) return;

  if (state.comparisonChartInstance) {
    state.comparisonChartInstance.destroy();
    state.comparisonChartInstance = null;
  }

  if (state.starredKeys.length === 0) return;

  const ctx = canvas.getContext("2d");
  const datasets = [];
  let commonLabels = [];
  const normalize = document.getElementById("toggle-normalize").checked;

  state.starredKeys.forEach((key, index) => {
    const meta = state.keyMetadata[key];
    if (!meta) return;

    const chartData = prepareChartData(key);
    if (datasets.length === 0) {
      commonLabels = chartData.labels;
    }

    const color = getStarredColor(index);
    let plottedData = chartData.data;

    if (normalize) {
      plottedData = normalizeData(chartData.data);
    }

    datasets.push({
      label: key.replace(/^device_info_/, "").replace(/_/g, " "),
      data: plottedData,
      borderColor: color,
      borderWidth: 2,
      pointBackgroundColor: color,
      pointRadius: plottedData.length > 100 ? 0 : 2.5,
      pointHoverRadius: 5,
      fill: false,
      tension: meta.type === "string" || meta.type === "boolean" ? 0 : 0.1,
      stepped:
        meta.type === "string" || meta.type === "boolean" ? "before" : false,
    });
  });

  const config = {
    type: "line",
    data: {
      labels: commonLabels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      onHover: (event, elements, chart) => {
        if (event.type === "mousemove") {
          const points = chart.getElementsAtEventForMode(
            event,
            "index",
            { intersect: false },
            false
          );
          const idx = points.length > 0 ? points[0].index : -1;
          if (idx !== state.globalCrosshairIndex) setCrosshairIndex(idx);
        } else if (event.type === "mouseout") {
          setCrosshairIndex(-1);
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#8b949e",
            font: { size: 11, family: "monospace" },
            boxWidth: 12,
            boxHeight: 12,
            padding: 15,
          },
        },
        tooltip: {
          backgroundColor: "#161b22",
          titleColor: "#8b949e",
          bodyColor: "#f0f6fc",
          borderColor: "#30363d",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              const datasetIndex = context.datasetIndex;
              const key = state.starredKeys[datasetIndex];
              if (!key) return "";

              const meta = state.keyMetadata[key];
              const cleanTitle = key
                .replace(/^device_info_/, "")
                .replace(/_/g, " ");

              const { indices } = getFilteredHistoryAndIndices();
              const rawIdx = indices[context.dataIndex];
              let rawVal = "N/A";
              if (meta) {
                rawVal = meta.isConstant
                  ? meta.latestValue
                  : meta.values && rawIdx !== undefined
                  ? meta.values[rawIdx]
                  : "N/A";
              }

              let displayVal = rawVal;
              if (meta.type === "boolean") {
                displayVal =
                  rawVal === null || rawVal === undefined
                    ? "N/A"
                    : rawVal
                    ? "TRUE"
                    : "FALSE";
              } else if (meta.type === "string") {
                displayVal = rawVal;
              } else if (typeof rawVal === "number") {
                displayVal = rawVal.toLocaleString();
              }

              return `${cleanTitle}: ${displayVal}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "category",
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: {
            color: "#8b949e",
            font: { size: 10 },
          },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          min: normalize ? 0 : undefined,
          max: normalize ? 100 : undefined,
          ticks: {
            color: "#8b949e",
            font: { size: 10, family: "monospace" },
            callback: function (value) {
              if (normalize) return value + "%";
              return value;
            },
          },
        },
      },
    },
  };

  state.comparisonChartInstance = new Chart(ctx, config);
}

export function initializeStarredGridChart(card, key, index) {
  const canvas = card.querySelector(`canvas`);
  const placeholder = card.querySelector(".chart-placeholder");

  if (!canvas) return;
  canvas.style.display = "block";
  if (placeholder) placeholder.style.display = "none";

  const meta = state.keyMetadata[key];
  const chartData = prepareChartData(key);
  const color = getStarredColor(index);
  const ctx = canvas.getContext("2d");

  const config = {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: key,
          data: chartData.data,
          borderColor: color,
          borderWidth: 1.5,
          pointBackgroundColor: color,
          pointRadius: chartData.data.length > 50 ? 0 : 2,
          pointHoverRadius: 4,
          fill: false,
          tension: meta.type === "string" || meta.type === "boolean" ? 0 : 0.1,
          stepped:
            meta.type === "string" || meta.type === "boolean" ? "before" : false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      onHover: (event, elements, chart) => {
        if (event.type === "mousemove") {
          const points = chart.getElementsAtEventForMode(
            event,
            "index",
            { intersect: false },
            false
          );
          const idx = points.length > 0 ? points[0].index : -1;
          if (idx !== state.globalCrosshairIndex) setCrosshairIndex(idx);
        } else if (event.type === "mouseout") {
          setCrosshairIndex(-1);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: "category",
          grid: { color: "rgba(255, 255, 255, 0.02)" },
          ticks: {
            color: "#8b949e",
            font: { size: 9 },
            maxTicksLimit: 4,
          },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.02)" },
          ticks: {
            color: "#8b949e",
            font: { size: 9, family: "monospace" },
            precision: meta.type === "number" ? 2 : 0,
            callback: function (value) {
              if (meta.type === "boolean") {
                if (value === 0) return "FALSE";
                if (value === 1) return "TRUE";
                return "";
              }
              if (meta.type === "string") {
                const stringsList = state.cardLookupMap[key] || [];
                return stringsList[value] !== undefined ? stringsList[value] : value;
              }
              return value;
            },
          },
        },
      },
    },
  };

  state.starredChartsInstanceMap[key] = new Chart(ctx, config);
}

export function initializeChart(card, key, cachedFilter) {
  const canvas = card.querySelector(`canvas`);
  const placeholder = card.querySelector(".chart-placeholder");

  if (!canvas) return;
  canvas.style.display = "block";
  if (placeholder) placeholder.style.display = "none";

  const meta = state.keyMetadata[key];
  const chartData = prepareChartData(key, cachedFilter);
  const color = "#58a6ff";
  const ctx = canvas.getContext("2d");

  const config = {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: key,
          data: chartData.data,
          borderColor: color,
          borderWidth: 1.5,
          pointBackgroundColor: color,
          pointRadius: chartData.data.length > 50 ? 0 : 2,
          pointHoverRadius: 4,
          fill: false,
          tension: meta.type === "string" || meta.type === "boolean" ? 0 : 0.1,
          stepped:
            meta.type === "string" || meta.type === "boolean" ? "before" : false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      onHover: (event, elements, chart) => {
        if (event.type === "mousemove") {
          const points = chart.getElementsAtEventForMode(
            event,
            "index",
            { intersect: false },
            false
          );
          const idx = points.length > 0 ? points[0].index : -1;
          if (idx !== state.globalCrosshairIndex) setCrosshairIndex(idx);
        } else if (event.type === "mouseout") {
          setCrosshairIndex(-1);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false, // crosshair replaces per-card tooltip
        },
      },
      scales: {
        x: {
          type: "category",
          grid: { color: "rgba(255, 255, 255, 0.02)" },
          ticks: {
            color: "#8b949e",
            font: { size: 9 },
            maxTicksLimit: 4,
          },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.02)" },
          ticks: {
            color: "#8b949e",
            font: { size: 9, family: "monospace" },
            precision: meta.type === "number" ? 2 : 0,
            callback: function (value) {
              if (meta.type === "boolean") {
                if (value === 0) return "FALSE";
                if (value === 1) return "TRUE";
                return "";
              }
              if (meta.type === "string") {
                const stringsList = state.cardLookupMap[key] || [];
                return stringsList[value] !== undefined ? stringsList[value] : value;
              }
              return value;
            },
          },
        },
      },
    },
  };

  state.chartsInstanceMap[key] = new Chart(ctx, config);
}

// Performance: defer chart initialization to browser idle time
const scheduleIdle = window.requestIdleCallback
  ? window.requestIdleCallback.bind(window)
  : (fn) => setTimeout(fn, 0);

export function deferChartInit(card, key, cachedFilter) {
  if (state.pendingChartInits.has(key)) return;
  state.pendingChartInits.add(key);
  scheduleIdle(() => {
    state.pendingChartInits.delete(key);
    // Only init if the card is still in the DOM and chart hasn't been created
    if (!card.isConnected || state.chartsInstanceMap[key]) return;
    initializeChart(card, key, cachedFilter);
  });
}
