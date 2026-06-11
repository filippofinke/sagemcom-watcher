/**
 * Utility helper functions for Sagemcom Watcher.
 */

import { state } from "./state.js";

const PALETTE = [
  "#58a6ff", // blue
  "#ff7b72", // coral/red
  "#7ee787", // green
  "#d2a8ff", // purple
  "#e3b341", // yellow
  "#f78166", // orange
  "#39c5bb", // teal
  "#db61a2", // pink
];

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function getStarredColor(index) {
  return PALETTE[index % PALETTE.length];
}

export function getStarIconSVG(isStarred) {
  if (isStarred) {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/>
      </svg>
    `;
  } else {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694z"/>
      </svg>
    `;
  }
}

export function normalizeData(data) {
  const cleanVals = data.filter((v) => v !== null);
  if (cleanVals.length === 0) return data;
  const min = Math.min(...cleanVals);
  const max = Math.max(...cleanVals);
  const range = max - min;
  if (range === 0) {
    return data.map((v) => (v === null ? null : 50));
  }
  return data.map((v) => (v === null ? null : ((v - min) / range) * 100));
}

export function toLocalDateTimeString(date) {
  const tzoffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzoffset)
    .toISOString()
    .slice(0, 19);
  return localISOTime;
}

export function getFilteredHistoryAndIndices() {
  const selectEl = document.getElementById("time-range-select");
  const selectVal = selectEl ? selectEl.value : "";
  let timeStartVal = null;
  let timeEndVal = null;

  if (selectVal === "range") {
    const startInput = document.getElementById("range-start");
    const endInput = document.getElementById("range-end");
    if (startInput && startInput.value) timeStartVal = new Date(startInput.value);
    if (endInput && endInput.value) timeEndVal = new Date(endInput.value);
  }

  const indices = [];
  const historySlice = [];

  state.rawHistory.forEach((item, idx) => {
    let keep = true;
    const itemTime = new Date(item.timestamp);
    if (selectVal === "range") {
      if (timeStartVal && itemTime < timeStartVal) keep = false;
      if (timeEndVal && itemTime > timeEndVal) keep = false;
    } else if (state.timeRangeHours !== null) {
      const cutoff = new Date(Date.now() - state.timeRangeHours * 3600 * 1000);
      if (itemTime < cutoff) keep = false;
    }
    if (keep) {
      indices.push(idx);
      historySlice.push(item);
    }
  });

  return { historySlice, indices };
}

const CATEGORIES = {
  system: [
    "device_info_model_name",
    "device_info_software_version",
    "device_info_manufacturer",
    "device_info_serial_number",
    "device_info_hardware_version",
    "device_info_up_time",
    "device_info_reboot_count",
    "device_info_router_name",
    "device_info_country",
  ],
  processors: ["processor", "cpu"],
  network: [
    "wifi",
    "ssid",
    "lan",
    "wan",
    "port_mapping",
    "mac_address",
    "ip_address",
    "dhcp",
    "dns",
  ],
  memory: ["memory", "flash", "size", "storage"],
  sensors: ["temperature", "sensor"],
  logging: ["log", "syslog"],
};

export function getCategoryForKey(key) {
  const keyLower = key.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => keyLower.includes(kw))) {
      return cat;
    }
  }
  return "other";
}

export function getValueType(val) {
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  return "string";
}

export function formatTimeLabel(isoString, includeDate = false) {
  try {
    const date = new Date(isoString);
    if (includeDate) {
      return (
        date.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    return isoString;
  }
}

export function formatDateLabel(isoString) {
  try {
    const date = new Date(isoString);
    return (
      date.toLocaleDateString([], { month: "short", day: "2-digit" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch (e) {
    return isoString;
  }
}

export function formatUptime(seconds) {
  if (seconds === undefined || seconds === null) return "N/A";
  const secs = parseInt(seconds, 10);
  const days = Math.floor(secs / (3600 * 24));
  const hours = Math.floor((secs % (3600 * 24)) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);

  let parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function highlightText(text, search) {
  if (!search) return text;
  const regex = new RegExp(
    `(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`,
    "gi"
  );
  return text.replace(regex, '<span class="highlight">$1</span>');
}

export function replaceSpecialChars(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function formatDisplayValue(val, type) {
  if (val === null || val === undefined || val === "") return "-";
  if (type === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") {
    if (val > 1000000) return (val / 1000000).toFixed(1) + "M";
    return val.toString();
  }
  return val.toString();
}

export function csvFormat(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function generateExportData() {
  const { historySlice, indices } = getFilteredHistoryAndIndices();

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

  filteredKeys.sort();

  const lines = [];

  // Header: timestamp row
  const timestampRow = ["timestamp"];
  historySlice.forEach((item) => {
    timestampRow.push(item.timestamp);
  });
  lines.push(timestampRow.map(csvFormat).join(","));

  // Key rows
  filteredKeys.forEach((key) => {
    const meta = state.keyMetadata[key];
    const row = [key];

    if (meta.isConstant) {
      const val = meta.latestValue;
      for (let i = 0; i < historySlice.length; i++) {
        row.push(val);
      }
    } else {
      const slicedValues = meta.values
        ? indices.map((idx) => meta.values[idx])
        : [];
      for (let i = 0; i < historySlice.length; i++) {
        row.push(slicedValues[i]);
      }
    }
    lines.push(row.map(csvFormat).join(","));
  });

  return {
    text: lines.join("\n"),
    rowsCount: historySlice.length,
    metricsCount: filteredKeys.length,
  };
}
