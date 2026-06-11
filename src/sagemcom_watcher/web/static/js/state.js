/**
 * Shared state container for Sagemcom Watcher.
 */

export const state = {
  isFetching: false,
  rawHistory: [],
  keyMetadata: {}, // key -> { values: [], type: '', isConstant: bool, category: '' }
  chartsInstanceMap: {}, // key -> Chart instance
  currentFilterCategory: "all",
  searchQuery: "",
  showConstants: true,
  activeModalIndex: null,
  modalChartInstance: null,
  cardLookupMap: {}, // string mapping lookup table
  lastPollTime: null, // store last poll timestamp date
  lastRefreshTime: null, // store last UI refresh timestamp date
  modalRows: [], // array of {key, val} for detailed variable log inspector
  timeRangeHours: 24, // null = all time, number = filter to last N hours

  // Starred Comparison Dashboard State
  starredKeys: [],
  currentComparisonView: "both",
  isComparisonNormalized: true,
  isDashboardCollapsed: false,
  comparisonChartInstance: null,
  starredChartsInstanceMap: {},

  // Performance: track visible chart keys for selective crosshair redraws
  visibleChartKeys: new Set(),
  // Performance: pending deferred chart inits
  pendingChartInits: new Set(),
  globalCrosshairIndex: -1,
};

export function loadStarredKeys() {
  try {
    const stored = localStorage.getItem("sagemcom_watcher_starred");
    if (stored) {
      state.starredKeys = JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error loading starred keys:", e);
    state.starredKeys = [];
  }
}

export function saveStarredKeys() {
  try {
    localStorage.setItem(
      "sagemcom_watcher_starred",
      JSON.stringify(state.starredKeys)
    );
  } catch (e) {
    console.error("Error saving starred keys:", e);
  }
}

export function loadComparisonState() {
  try {
    const storedView = localStorage.getItem("sagemcom_watcher_comparison_view");
    if (storedView) state.currentComparisonView = storedView;

    const storedNorm = localStorage.getItem(
      "sagemcom_watcher_comparison_normalized"
    );
    if (storedNorm !== null) state.isComparisonNormalized = storedNorm === "true";

    const storedCollapse = localStorage.getItem(
      "sagemcom_watcher_comparison_collapsed"
    );
    if (storedCollapse !== null) {
      state.isDashboardCollapsed = storedCollapse === "true";
    }
  } catch (e) {
    console.error("Error loading comparison state:", e);
  }
}

export function saveComparisonState() {
  try {
    localStorage.setItem(
      "sagemcom_watcher_comparison_view",
      state.currentComparisonView
    );
    localStorage.setItem(
      "sagemcom_watcher_comparison_normalized",
      state.isComparisonNormalized
    );
    localStorage.setItem(
      "sagemcom_watcher_comparison_collapsed",
      state.isDashboardCollapsed
    );
  } catch (e) {
    console.error("Error saving comparison state:", e);
  }
}

export function loadConstantsState() {
  try {
    const stored = localStorage.getItem("sagemcom_watcher_show_constants");
    if (stored !== null) {
      state.showConstants = stored === "true";
    }
  } catch (e) {
    console.error("Error loading constants state:", e);
  }
}

export function saveConstantsState() {
  try {
    localStorage.setItem("sagemcom_watcher_show_constants", state.showConstants);
  } catch (e) {
    console.error("Error saving constants state:", e);
  }
}
