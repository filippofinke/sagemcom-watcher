/**
 * Core application orchestrator for Sagemcom Watcher.
 */

import {
  state,
  loadStarredKeys,
  saveStarredKeys,
  loadComparisonState,
  saveComparisonState,
  loadConstantsState,
  saveConstantsState,
} from "./state.js";
import {
  debounce,
  getStarredColor,
  getStarIconSVG,
  toLocalDateTimeString,
  getFilteredHistoryAndIndices,
  highlightText,
  replaceSpecialChars,
  formatDisplayValue,
  formatTimeLabel,
  formatDateLabel,
  formatUptime,
  generateExportData,
  getValueType,
  getCategoryForKey,
} from "./utils.js";
import {
  setCrosshairIndex,
  renderComparisonChart,
  initializeStarredGridChart,
  initializeChart,
  deferChartInit,
  prepareChartData,
} from "./charts.js";

// Export toggleStarKey for use within the app modules
export function toggleStarKey(key) {
  const index = state.starredKeys.indexOf(key);
  if (index > -1) {
    state.starredKeys.splice(index, 1);
  } else {
    state.starredKeys.push(key);
  }
  saveStarredKeys();

  updateStarIconsFor(key);
  updateModalRowStarIcon(key);
  updateComparisonDashboard();
}

export function updateStarIconsFor(key) {
  const mainCard = document.querySelector(`.chart-card[data-key="${key}"]`);
  if (mainCard) {
    const starBtn = mainCard.querySelector(".star-btn");
    if (starBtn) {
      const isStarred = state.starredKeys.includes(key);
      starBtn.className = `star-btn ${isStarred ? "starred" : ""}`;
      starBtn.setAttribute("title", isStarred ? "Unstar metric" : "Star metric");
      starBtn.innerHTML = getStarIconSVG(isStarred);
    }
  }
  const starredCard = document.querySelector(
    `.chart-card[data-starred-key="${key}"]`
  );
  if (starredCard) {
    const starBtn = starredCard.querySelector(".star-btn");
    if (starBtn) {
      const isStarred = state.starredKeys.includes(key);
      starBtn.className = `star-btn ${isStarred ? "starred" : ""}`;
      starBtn.setAttribute("title", isStarred ? "Unstar metric" : "Star metric");
      starBtn.innerHTML = getStarIconSVG(isStarred);
    }
  }
}

export function updateModalRowStarIcon(key) {
  const btn = document.querySelector(`.row-star-btn[data-key="${key}"]`);
  if (btn) {
    const isStarred = state.starredKeys.includes(key);
    btn.className = `row-star-btn ${isStarred ? "starred" : ""}`;
    btn.setAttribute("title", isStarred ? "Unstar metric" : "Star metric");
    btn.innerHTML = getStarIconSVG(isStarred);
  }
}

export function updateComparisonDashboard() {
  const starredSection = document.getElementById("starred-section");
  if (!starredSection) return;

  if (state.starredKeys.length === 0) {
    starredSection.style.display = "none";
    if (state.comparisonChartInstance) {
      state.comparisonChartInstance.destroy();
      state.comparisonChartInstance = null;
    }
    Object.values(state.starredChartsInstanceMap).forEach((ch) => ch.destroy());
    state.starredChartsInstanceMap = {};
    return;
  }

  starredSection.style.display = "block";
  document.getElementById("starred-count-badge").innerText =
    state.starredKeys.length;

  const starredBody = document.getElementById("starred-body");
  const collapseBtn = document.getElementById("collapse-dashboard-btn");
  if (state.isDashboardCollapsed) {
    starredBody.classList.add("collapsed");
    collapseBtn.classList.add("collapsed");
    return;
  } else {
    starredBody.classList.remove("collapsed");
    collapseBtn.classList.remove("collapsed");
  }

  document
    .querySelectorAll(".view-toggle-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (state.currentComparisonView === "combined") {
    document.getElementById("view-combined-btn").classList.add("active");
    document.getElementById("comparison-chart-card").style.display = "block";
    document.getElementById("starred-grid").style.display = "none";
    renderComparisonChart();
    Object.values(state.starredChartsInstanceMap).forEach((ch) => ch.destroy());
    state.starredChartsInstanceMap = {};
  } else if (state.currentComparisonView === "split") {
    document.getElementById("view-split-btn").classList.add("active");
    document.getElementById("comparison-chart-card").style.display = "none";
    document.getElementById("starred-grid").style.display = "grid";
    renderStarredGrid();
    if (state.comparisonChartInstance) {
      state.comparisonChartInstance.destroy();
      state.comparisonChartInstance = null;
    }
  } else {
    document.getElementById("view-both-btn").classList.add("active");
    document.getElementById("comparison-chart-card").style.display = "block";
    document.getElementById("starred-grid").style.display = "grid";
    renderComparisonChart();
    renderStarredGrid();
  }
}

export function renderStarredGrid() {
  const grid = document.getElementById("starred-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (state.starredKeys.length === 0) return;

  state.starredKeys.forEach((key, index) => {
    const meta = state.keyMetadata[key];
    if (!meta) return;

    const card = document.createElement("div");
    card.className = "chart-card";
    card.setAttribute("data-starred-key", key);
    card.style.position = "relative";
    card.style.height = "250px";

    const cleanTitle = key.replace(/^device_info_/, "").replace(/_/g, " ");

    card.innerHTML = `
      <div class="chart-header">
        <div class="chart-title-wrapper">
          <span class="chart-category">${meta.category}</span>
          <span class="chart-title" title="${key}">${cleanTitle}</span>
        </div>
        <div class="chart-actions">
          <button class="star-btn starred" data-key="${key}" title="Unstar metric">
            ${getStarIconSVG(true)}
          </button>
          <div class="chart-value-badge" title="${meta.latestValue}">
            ${formatDisplayValue(meta.latestValue, meta.type)}
          </div>
        </div>
      </div>
      <div class="chart-container">
        <div class="chart-placeholder">Loading Chart...</div>
        <canvas id="starred-canvas-${replaceSpecialChars(
          key
        )}" style="display: none;"></canvas>
      </div>
      ${meta.isConstant ? '<span class="static-badge">Static Value</span>' : ""}
    `;

    grid.appendChild(card);

    card.addEventListener("click", (e) => {
      if (e.target.closest(".star-btn")) return;
      openChartModal(key);
    });

    const starBtn = card.querySelector(".star-btn");
    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleStarKey(key);
    });

    initializeStarredGridChart(card, key, index);
  });
}

function renderChartsGrid() {
  const grid = document.getElementById("charts-grid");
  if (!grid) return;

  // Performance: cache the filtered history once per render pass
  const cachedFilter = getFilteredHistoryAndIndices();

  const filteredKeys = Object.keys(state.keyMetadata).filter((key) => {
    const meta = state.keyMetadata[key];
    if (
      state.currentFilterCategory !== "all" &&
      meta.category !== state.currentFilterCategory
    ) {
      return false;
    }
    if (!state.showConstants && meta.isConstant) return false;
    if (
      state.searchQuery &&
      !key.toLowerCase().includes(state.searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // 1. Calculate Grid Columns and Dimensions
  let gridWidth = grid.clientWidth;
  if (!gridWidth && grid.parentElement) {
    const parentStyle = getComputedStyle(grid.parentElement);
    const pl = parseFloat(parentStyle.paddingLeft) || 0;
    const pr = parseFloat(parentStyle.paddingRight) || 0;
    gridWidth = grid.parentElement.clientWidth - pl - pr;
  }
  if (!gridWidth) gridWidth = window.innerWidth - 48;

  const rootFontSize =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const gap = rootFontSize * 1; // 1rem
  const minColWidth = 380;

  const columns = Math.max(
    1,
    Math.floor((gridWidth + gap) / (minColWidth + gap))
  );
  const colWidth = (gridWidth - (columns - 1) * gap) / columns;
  const cardHeight = 250;
  const rowHeight = cardHeight + gap;

  const totalRows = Math.ceil(filteredKeys.length / columns);
  grid.style.position = "relative";
  grid.style.height = `${totalRows * rowHeight}px`;

  // 2. Calculate Viewport and Visible Range
  const gridRect = grid.getBoundingClientRect();
  const gridTop = gridRect.top + window.scrollY;

  const viewportTop = window.scrollY;
  const viewportBottom = window.scrollY + window.innerHeight;

  const relativeViewportTop = Math.max(0, viewportTop - gridTop);
  const relativeViewportBottom = Math.max(0, viewportBottom - gridTop);

  const visibleRowStart = Math.floor(relativeViewportTop / rowHeight);
  const visibleRowEnd = Math.ceil(relativeViewportBottom / rowHeight);

  const buffer = 2;
  const startRow = Math.max(0, visibleRowStart - buffer);
  const endRow = Math.min(totalRows, visibleRowEnd + buffer);

  const startIndex = startRow * columns;
  const endIndex = Math.min(filteredKeys.length, endRow * columns);

  const visibleKeys = filteredKeys.slice(startIndex, endIndex);
  const visibleKeysSet = new Set(visibleKeys);

  // Performance: update global visible keys set for crosshair optimization
  state.visibleChartKeys = visibleKeysSet;

  // 3. Destroy Out-of-View Charts
  Object.keys(state.chartsInstanceMap).forEach((key) => {
    if (!visibleKeysSet.has(key)) {
      if (state.chartsInstanceMap[key]) {
        state.chartsInstanceMap[key].destroy();
        delete state.chartsInstanceMap[key];
      }
    }
  });

  // Performance: cancel pending inits for keys no longer visible
  state.pendingChartInits.forEach((key) => {
    if (!visibleKeysSet.has(key)) {
      state.pendingChartInits.delete(key);
    }
  });

  // 4. Remove Out-of-View Elements
  const existingCards = {};
  Array.from(grid.children).forEach((card) => {
    const key = card.getAttribute("data-key");
    if (visibleKeysSet.has(key)) {
      existingCards[key] = card;
    } else {
      card.remove();
    }
  });

  // 5. Render/Position Visible Cards
  visibleKeys.forEach((key, idx) => {
    const actualIndex = startIndex + idx;
    const row = Math.floor(actualIndex / columns);
    const col = actualIndex % columns;

    const top = row * rowHeight;
    const left = col * (colWidth + gap);

    const meta = state.keyMetadata[key];
    let card = existingCards[key];

    if (!card) {
      card = document.createElement("div");
      card.className = "chart-card";
      card.setAttribute("data-key", key);

      card.style.position = "absolute";
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
      card.style.width = `${colWidth}px`;
      card.style.height = `${cardHeight}px`;

      const isStarred = state.starredKeys.includes(key);
      const cleanTitle = key.replace(/^device_info_/, "").replace(/_/g, " ");
      card.innerHTML = `
        <div class="chart-header">
          <div class="chart-title-wrapper">
            <span class="chart-category">${meta.category}</span>
            <span class="chart-title" title="${key}">${highlightText(
        cleanTitle,
        state.searchQuery
      )}</span>
          </div>
          <div class="chart-actions">
            <button class="star-btn ${
              isStarred ? "starred" : ""
            }" data-key="${key}" title="${
        isStarred ? "Unstar metric" : "Star metric"
      }">
              ${getStarIconSVG(isStarred)}
            </button>
            <div class="chart-value-badge" title="${meta.latestValue}">
              ${formatDisplayValue(meta.latestValue, meta.type)}
            </div>
          </div>
        </div>
        <div class="chart-container">
          <div class="chart-placeholder">Loading Chart...</div>
          <canvas id="canvas-${replaceSpecialChars(
            key
          )}" style="display: none;"></canvas>
        </div>
        ${meta.isConstant ? '<span class="static-badge">Static Value</span>' : ""}
      `;
      grid.appendChild(card);

      card.addEventListener("click", (e) => {
        if (e.target.closest(".star-btn")) return;
        openChartModal(key);
      });

      const starBtn = card.querySelector(".star-btn");
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleStarKey(key);
      });

      // Performance: defer chart creation to idle time
      deferChartInit(card, key, cachedFilter);
    } else {
      // Update layout
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
      card.style.width = `${colWidth}px`;
      card.style.height = `${cardHeight}px`;

      // Update content
      const badge = card.querySelector(".chart-value-badge");
      if (badge) {
        badge.innerText = formatDisplayValue(meta.latestValue, meta.type);
        badge.setAttribute("title", meta.latestValue);
      }
      const titleSpan = card.querySelector(".chart-title");
      if (titleSpan) {
        const cleanTitle = key.replace(/^device_info_/, "").replace(/_/g, " ");
        titleSpan.innerHTML = highlightText(cleanTitle, state.searchQuery);
      }

      // Update star icon in case it changed
      const starBtn = card.querySelector(".star-btn");
      if (starBtn) {
        const isStarred = state.starredKeys.includes(key);
        starBtn.className = `star-btn ${isStarred ? "starred" : ""}`;
        starBtn.setAttribute(
          "title",
          isStarred ? "Unstar metric" : "Star metric"
        );
        starBtn.innerHTML = getStarIconSVG(isStarred);
      }

      // Update Chart data using cached filter
      const chart = state.chartsInstanceMap[key];
      if (chart) {
        const chartData = prepareChartData(key, cachedFilter);
        chart.data.labels = chartData.labels;
        chart.data.datasets[0].data = chartData.data;
        chart.update("none");
      } else if (!state.pendingChartInits.has(key)) {
        deferChartInit(card, key, cachedFilter);
      }
    }
  });
}

function openChartModal(key) {
  const meta = state.keyMetadata[key];
  if (!meta) return;

  document.getElementById("chart-modal").classList.add("open");
  const cleanTitle = key.replace(/^device_info_/, "").replace(/_/g, " ");
  document.getElementById("chart-modal-title").innerText = `${cleanTitle} (${key})`;

  const starBtn = document.getElementById("chart-modal-star-btn");
  if (starBtn) {
    const isStarred = state.starredKeys.includes(key);
    starBtn.className = `row-star-btn ${isStarred ? "starred" : ""}`;
    starBtn.setAttribute("title", isStarred ? "Unstar metric" : "Star metric");
    starBtn.innerHTML = getStarIconSVG(isStarred);

    const newStarBtn = starBtn.cloneNode(true);
    starBtn.parentNode.replaceChild(newStarBtn, starBtn);
    newStarBtn.addEventListener("click", () => {
      toggleStarKey(key);
      const nowStarred = state.starredKeys.includes(key);
      newStarBtn.className = `row-star-btn ${nowStarred ? "starred" : ""}`;
      newStarBtn.setAttribute(
        "title",
        nowStarred ? "Unstar metric" : "Star metric"
      );
      newStarBtn.innerHTML = getStarIconSVG(nowStarred);
    });
  }

  const canvas = document.getElementById("chart-modal-canvas");
  const ctx = canvas.getContext("2d");
  const chartData = prepareChartData(key);
  const color = "#58a6ff";

  if (state.modalChartInstance) {
    state.modalChartInstance.destroy();
  }

  const config = {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: key,
          data: chartData.data,
          borderColor: color,
          borderWidth: 2,
          pointBackgroundColor: color,
          pointRadius: chartData.data.length > 100 ? 0 : 3,
          pointHoverRadius: 6,
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
          backgroundColor: "#161b22",
          titleColor: "#8b949e",
          bodyColor: "#f0f6fc",
          borderColor: "#30363d",
          borderWidth: 1,
          callbacks: {
            label: function (context) {
              const val = context.parsed.y;
              if (meta.type === "boolean") {
                return `Value: ${val === 1 ? "TRUE" : "FALSE"}`;
              }
              if (meta.type === "string") {
                const stringsList = state.cardLookupMap[key] || [];
                return `Value: ${
                  stringsList[val] !== undefined ? stringsList[val] : val
                }`;
              }
              return `Value: ${val}`;
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
            font: { size: 11 },
          },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: {
            color: "#8b949e",
            font: { size: 11, family: "monospace" },
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

  state.modalChartInstance = new Chart(ctx, config);
}

function closeChartModal() {
  document.getElementById("chart-modal").classList.remove("open");
  if (state.modalChartInstance) {
    state.modalChartInstance.destroy();
    state.modalChartInstance = null;
  }
}

function openModal(index) {
  state.activeModalIndex = index;
  document.getElementById("inspect-modal").classList.add("open");
  renderModalData(index);
}

function closeModal() {
  state.activeModalIndex = null;
  document.getElementById("inspect-modal").classList.remove("open");
}

function renderModalData(index) {
  const entry = state.rawHistory[index];
  if (!entry) return;

  document.getElementById("modal-timestamp").innerText = `Details: ${formatDateLabel(
    entry.timestamp
  )}`;

  state.modalRows = [];
  Object.keys(state.keyMetadata)
    .sort()
    .forEach((key) => {
      if (key === "timestamp") return;
      const meta = state.keyMetadata[key];
      const val = meta.isConstant ? meta.latestValue : meta.values[index];
      state.modalRows.push({ key, val });
    });

  // Reset scroll position of modal content when opening
  const modalContent = document.querySelector("#inspect-modal .modal-content");
  if (modalContent) modalContent.scrollTop = 0;

  updateModalVirtualList();
}

function updateModalVirtualList() {
  const modalContent = document.querySelector("#inspect-modal .modal-content");
  const container = document.getElementById("json-viewer");
  if (!modalContent || !container) return;

  const searchVal = document.getElementById("json-search").value.toLowerCase();

  // Filter rows based on search
  const filteredRows = state.modalRows.filter((row) => {
    if (!searchVal) return true;
    return (
      row.key.toLowerCase().includes(searchVal) ||
      String(row.val).toLowerCase().includes(searchVal)
    );
  });

  const scrollTop = modalContent.scrollTop;
  const viewportHeight = modalContent.clientHeight;

  // Compute actual row height from a temp measurement the first time
  const rowHeight = (() => {
    if (!window._modalRowHeight) {
      const probe = document.createElement("div");
      probe.className = "json-row";
      probe.style.visibility = "hidden";
      probe.style.position = "absolute";
      probe.innerHTML = '<span class="json-key">probe:</span><span class="json-val">x</span>';
      container.appendChild(probe);
      const h = probe.getBoundingClientRect().height || 28;
      container.removeChild(probe);
      window._modalRowHeight = h || 28;
    }
    return window._modalRowHeight;
  })();

  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 10);
  const endIndex = Math.min(
    filteredRows.length,
    startIndex + visibleCount + 20
  );

  container.innerHTML = "";

  // Top spacer
  if (startIndex > 0) {
    const topSpacer = document.createElement("div");
    topSpacer.style.height = `${startIndex * rowHeight}px`;
    container.appendChild(topSpacer);
  }

  // Visible rows
  for (let i = startIndex; i < endIndex; i++) {
    const rowData = filteredRows[i];
    const isStarred = state.starredKeys.includes(rowData.key);
    const row = document.createElement("div");
    row.className = "json-row";
    row.innerHTML = `
      <button class="row-star-btn ${
        isStarred ? "starred" : ""
      }" data-key="${rowData.key}" title="${isStarred ? "Unstar metric" : "Star metric"}">
        ${getStarIconSVG(isStarred)}
      </button>
      <span class="json-key" style="margin-left: 0.25rem;">${rowData.key}:</span>
      <span class="json-val">${highlightText(String(rowData.val), searchVal)}</span>
    `;

    const starBtn = row.querySelector(".row-star-btn");
    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleStarKey(rowData.key);
    });

    container.appendChild(row);
  }

  // Bottom spacer
  if (endIndex < filteredRows.length) {
    const bottomSpacer = document.createElement("div");
    bottomSpacer.style.height = `${
      (filteredRows.length - endIndex) * rowHeight
    }px`;
    container.appendChild(bottomSpacer);
  }
}

async function fetchHistoryData() {
  if (state.isFetching) return;
  state.isFetching = true;

  let url = "/api/history";
  const params = new URLSearchParams();

  const selectEl = document.getElementById("time-range-select");
  const selectVal = selectEl ? selectEl.value : "";

  if (selectVal === "range") {
    const startInput = document.getElementById("range-start");
    const endInput = document.getElementById("range-end");
    if (startInput && startInput.value) {
      params.append("start", new Date(startInput.value).toISOString());
    }
    if (endInput && endInput.value) {
      params.append("end", new Date(endInput.value).toISOString());
    }
  } else if (state.timeRangeHours !== null) {
    params.append("hours", state.timeRangeHours);
  }

  const queryStr = params.toString();
  if (queryStr) {
    url += "?" + queryStr;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    state.lastRefreshTime = new Date();
    if (data && data.history) {
      processHistoryData(data);
    }
  } catch (e) {
    console.error("Fetch error:", e);
  } finally {
    state.isFetching = false;
  }
}

function processHistoryData(optimizedData) {
  const history = optimizedData.history || [];
  const constants = optimizedData.constants || {};
  const promotedConstants = optimizedData.promoted_constants || {};

  state.rawHistory = history;
  const timestamps = history.map((item) => item.timestamp);
  const newKeyMetadata = {};

  // 1. Process constant keys
  Object.keys(constants).forEach((key) => {
    const val = constants[key];
    const type = getValueType(val);
    const category = getCategoryForKey(key);
    newKeyMetadata[key] = {
      values: null,
      type: type,
      isConstant: true,
      category: category,
      latestValue: val,
    };
  });

  // 2. Process dynamic keys
  const dynamicKeys = new Set();
  history.forEach((item) => {
    Object.keys(item).forEach((k) => {
      if (k !== "timestamp") dynamicKeys.add(k);
    });
  });

  dynamicKeys.forEach((key) => {
    const fallbackVal = promotedConstants[key] !== undefined ? promotedConstants[key] : null;
    let lastVal = fallbackVal;
    const values = history.map((item) => {
      if (item[key] !== undefined) {
        lastVal = item[key];
      }
      return lastVal;
    });

    // Find latest non-null value
    let latestValue = "N/A";
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== null) {
        latestValue = values[i];
        break;
      }
    }
    const type = latestValue !== "N/A" ? getValueType(latestValue) : "string";
    const category = getCategoryForKey(key);

    newKeyMetadata[key] = {
      values: values,
      type: type,
      isConstant: false,
      category: category,
      latestValue: latestValue,
    };
  });

  state.keyMetadata = newKeyMetadata;

  // Set last poll date object
  const lastTimestamp = timestamps[timestamps.length - 1];
  if (lastTimestamp) {
    state.lastPollTime = new Date(lastTimestamp);
  }

  renderStats(timestamps);
  renderChartsGrid();
  updateComparisonDashboard();

  if (state.activeModalIndex !== null) {
    renderModalData(state.activeModalIndex);
  }
}

function renderStats(timestamps) {
  document.getElementById("stat-total-records").innerText = timestamps.length;
  const lastTimestamp = timestamps[timestamps.length - 1];
  if (lastTimestamp) {
    document.getElementById("stat-last-poll").innerText =
      formatTimeLabel(lastTimestamp);
  }

  const latestObj = state.rawHistory[state.rawHistory.length - 1] || {};
  const uptimeKey = Object.keys(latestObj).find((k) => k.endsWith("up_time"));
  if (uptimeKey && latestObj[uptimeKey] !== undefined) {
    document.getElementById("stat-router-uptime").innerText = formatUptime(
      latestObj[uptimeKey]
    );
  } else {
    // Check in constants
    const constUptimeKey = Object.keys(state.keyMetadata).find(
      (k) => k.endsWith("up_time") && state.keyMetadata[k].isConstant
    );
    if (constUptimeKey) {
      document.getElementById("stat-router-uptime").innerText = formatUptime(
        state.keyMetadata[constUptimeKey].latestValue
      );
    } else {
      document.getElementById("stat-router-uptime").innerText = "N/A";
    }
  }
  updateTimeElapsed();
}

function updateTimeElapsed() {
  if (state.lastPollTime) {
    const now = new Date();
    const diffMs = now - state.lastPollTime;
    const diffSec = Math.floor(diffMs / 1000);

    let displayStr = "0s ago";
    if (diffSec >= 0) {
      if (diffSec < 60) {
        displayStr = `${diffSec}s ago`;
      } else {
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        displayStr = `${mins}m ${secs}s ago`;
      }
    }
    document.getElementById("stat-time-elapsed").innerText = displayStr;
  }

  if (state.lastRefreshTime) {
    const now = new Date();
    const diffMs = now - state.lastRefreshTime;
    const diffSec = Math.floor(diffMs / 1000);

    let displayStr = "0s ago";
    if (diffSec >= 0) {
      if (diffSec < 60) {
        displayStr = `${diffSec}s ago`;
      } else {
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        displayStr = `${mins}m ${secs}s ago`;
      }
    }
    document.getElementById("stat-refresh-elapsed").innerText = displayStr;
  }
}

function openExportModal() {
  const { text, rowsCount, metricsCount } = generateExportData();
  document.getElementById("export-text").value = text;
  document.getElementById(
    "export-meta-text"
  ).innerText = `Showing ${rowsCount} time point(s) / ${metricsCount} metric(s) with currently applied filters`;
  document.getElementById("export-modal").classList.add("open");
}

function closeExportModal() {
  document.getElementById("export-modal").classList.remove("open");
}

function copyExportToClipboard() {
  const txt = document.getElementById("export-text").value;
  navigator.clipboard
    .writeText(txt)
    .then(() => {
      const feedback = document.getElementById("export-copy-feedback");
      feedback.classList.add("show");
      setTimeout(() => {
        feedback.classList.remove("show");
      }, 2000);
    })
    .catch((err) => {
      console.error("Could not copy text: ", err);
    });
}

function downloadExportCSV() {
  const txt = document.getElementById("export-text").value;
  const blob = new Blob([txt], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const cat = state.currentFilterCategory;
  link.setAttribute("download", `router_data_export_${cat}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Event Bindings and Initial Start ───────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Initialize state
  loadStarredKeys();
  loadComparisonState();
  loadConstantsState();
  document.getElementById("toggle-normalize").checked = state.isComparisonNormalized;
  document.getElementById("toggle-constants").checked = state.showConstants;

  // Bind scrolling and resizing
  let scrollRAFPending = false;
  window.addEventListener(
    "scroll",
    () => {
      if (state.rawHistory.length > 0 && !scrollRAFPending) {
        scrollRAFPending = true;
        requestAnimationFrame(() => {
          scrollRAFPending = false;
          renderChartsGrid();
        });
      }
    },
    { passive: true }
  );

  window.addEventListener("resize", () => {
    if (state.rawHistory.length > 0) {
      renderChartsGrid();
    }
  });

  // Modal virtual scroll binding
  const modalContent = document.querySelector("#inspect-modal .modal-content");
  if (modalContent) {
    modalContent.addEventListener(
      "scroll",
      () => {
        if (state.activeModalIndex !== null) {
          updateModalVirtualList();
        }
      },
      { passive: true }
    );
  }

  // Bind search and filter controls
  document.getElementById("json-search").addEventListener("input", () => {
    const modalContent = document.querySelector("#inspect-modal .modal-content");
    if (modalContent) modalContent.scrollTop = 0;
    updateModalVirtualList();
  });

  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("inspect-modal").addEventListener("click", (e) => {
    if (e.target.id === "inspect-modal") closeModal();
  });

  document.getElementById("footer-btn-logs").addEventListener("click", () => {
    if (state.rawHistory.length > 0) openModal(state.rawHistory.length - 1);
  });
  document.getElementById("footer-btn-poll").addEventListener("click", () => {
    if (state.rawHistory.length > 0) openModal(state.rawHistory.length - 1);
  });

  document
    .getElementById("close-chart-modal")
    .addEventListener("click", closeChartModal);
  document.getElementById("chart-modal").addEventListener("click", (e) => {
    if (e.target.id === "chart-modal") closeChartModal();
  });

  // Performance: debounce search to avoid re-rendering on every keystroke
  const debouncedSearch = debounce(() => {
    renderChartsGrid();
  }, 300);
  document.getElementById("search-bar").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    debouncedSearch();
  });

  document.getElementById("filter-tags").addEventListener("click", (e) => {
    if (e.target.classList.contains("filter-tag")) {
      document
        .querySelectorAll(".filter-tag")
        .forEach((tag) => tag.classList.remove("active"));
      e.target.classList.add("active");
      state.currentFilterCategory = e.target.getAttribute("data-category");
      renderChartsGrid();
    }
  });

  document.getElementById("toggle-constants").addEventListener("change", (e) => {
    state.showConstants = e.target.checked;
    saveConstantsState();
    renderChartsGrid();
  });

  // Time range select event
  document.getElementById("time-range-select").addEventListener("change", (e) => {
    const val = e.target.value;
    const customWrap = document.getElementById("custom-hours-wrap");
    const rangeWrap = document.getElementById("custom-range-wrap");

    if (val === "custom") {
      customWrap.style.display = "flex";
      rangeWrap.style.display = "none";
      document.getElementById("custom-hours").focus();
      return; // wait for custom input
    } else if (val === "range") {
      customWrap.style.display = "none";
      rangeWrap.style.display = "flex";

      // Pre-populate if not already set and we have history
      if (state.rawHistory.length > 0) {
        const startInput = document.getElementById("range-start");
        const endInput = document.getElementById("range-end");
        if (!startInput.value) {
          const startDate = new Date(state.rawHistory[0].timestamp);
          startInput.value = toLocalDateTimeString(startDate);
        }
        if (!endInput.value) {
          const endDate = new Date(state.rawHistory[state.rawHistory.length - 1].timestamp);
          endInput.value = toLocalDateTimeString(endDate);
        }
      }

      // Trigger chart update
      Object.values(state.chartsInstanceMap).forEach((ch) => ch.destroy());
      state.chartsInstanceMap = {};
      fetchHistoryData();
      return;
    }

    customWrap.style.display = "none";
    rangeWrap.style.display = "none";
    state.timeRangeHours = val ? parseInt(val, 10) : null;
    Object.values(state.chartsInstanceMap).forEach((ch) => ch.destroy());
    state.chartsInstanceMap = {};
    fetchHistoryData();
  });

  document.getElementById("custom-hours").addEventListener("change", (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      state.timeRangeHours = val;
      Object.values(state.chartsInstanceMap).forEach((ch) => ch.destroy());
      state.chartsInstanceMap = {};
      fetchHistoryData();
    }
  });

  function handleRangeInputChange() {
    Object.values(state.chartsInstanceMap).forEach((ch) => ch.destroy());
    state.chartsInstanceMap = {};
    fetchHistoryData();
  }

  // Performance: debounce range inputs to avoid chart destruction on every keystroke
  const debouncedRangeChange = debounce(handleRangeInputChange, 500);
  document
    .getElementById("range-start")
    .addEventListener("change", debouncedRangeChange);
  document
    .getElementById("range-start")
    .addEventListener("input", debouncedRangeChange);
  document
    .getElementById("range-end")
    .addEventListener("change", debouncedRangeChange);
  document
    .getElementById("range-end")
    .addEventListener("input", debouncedRangeChange);

  // Bind Export Actions
  document.getElementById("export-btn").addEventListener("click", openExportModal);
  document
    .getElementById("close-export-modal")
    .addEventListener("click", closeExportModal);
  document.getElementById("export-modal").addEventListener("click", (e) => {
    if (e.target.id === "export-modal") closeExportModal();
  });
  document
    .getElementById("export-btn-copy")
    .addEventListener("click", copyExportToClipboard);
  document
    .getElementById("export-btn-download")
    .addEventListener("click", downloadExportCSV);

  // Bind Comparison Dashboard
  document.getElementById("view-combined-btn").addEventListener("click", () => {
    state.currentComparisonView = "combined";
    saveComparisonState();
    updateComparisonDashboard();
  });

  document.getElementById("view-split-btn").addEventListener("click", () => {
    state.currentComparisonView = "split";
    saveComparisonState();
    updateComparisonDashboard();
  });

  document.getElementById("view-both-btn").addEventListener("click", () => {
    state.currentComparisonView = "both";
    saveComparisonState();
    updateComparisonDashboard();
  });

  document.getElementById("toggle-normalize").addEventListener("change", (e) => {
    state.isComparisonNormalized = e.target.checked;
    saveComparisonState();
    if (
      state.currentComparisonView === "combined" ||
      state.currentComparisonView === "both"
    ) {
      renderComparisonChart();
    }
  });

  document
    .getElementById("collapse-dashboard-btn")
    .addEventListener("click", () => {
      state.isDashboardCollapsed = !state.isDashboardCollapsed;
      saveComparisonState();
      updateComparisonDashboard();
    });

  // Polling Loop
  async function pollHistory() {
    try {
      await fetchHistoryData();
    } catch (e) {
      console.error("Polling error:", e);
    }
    setTimeout(pollHistory, 10000);
  }

  // Start polling
  pollHistory();
  setInterval(updateTimeElapsed, 1000);
});
