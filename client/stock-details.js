const refreshStocksBtn = document.getElementById("refreshStocksBtn");
const refreshStocksBtnDefaultText = refreshStocksBtn
  ? refreshStocksBtn.textContent.trim()
  : "Refresh Stock Data";
const stockLastUpdatedEl = document.getElementById("stockLastUpdated");
const stockErrorBoxEl = document.getElementById("stockErrorBox");
const stockMessageEl = document.getElementById("stockMessage");
const stockTableBodyEl = document.getElementById("stockTableBody");
const smallCapMessageEl = document.getElementById("smallCapMessage");
const smallCapTableBodyEl = document.getElementById("smallCapTableBody");

const STOCK_CACHE_KEY = "stockDetailsDailyCacheV2";
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) {
    return;
  }

  if (isLoading) {
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  button.textContent = defaultText;
}

function ensurePageProgress() {
  const existing = document.getElementById("pageProgressOverlay");
  if (existing) {
    return existing;
  }

  const wrapper = document.createElement("section");
  wrapper.id = "pageProgressOverlay";
  wrapper.className = "page-progress hidden";
  wrapper.setAttribute("aria-live", "polite");
  wrapper.setAttribute("aria-busy", "false");
  wrapper.innerHTML =
    '<div class="page-progress-panel"><p class="page-progress-text">Loading data...</p><div class="page-progress-track"><div class="page-progress-bar"></div></div></div>';
  document.body.appendChild(wrapper);
  return wrapper;
}

const pageProgressEl = ensurePageProgress();

function setPageProgress(isVisible, message = "Loading data...") {
  if (!pageProgressEl) {
    return;
  }

  const textEl = pageProgressEl.querySelector(".page-progress-text");
  if (textEl) {
    textEl.textContent = message;
  }

  pageProgressEl.classList.toggle("hidden", !isVisible);
  pageProgressEl.setAttribute("aria-busy", isVisible ? "true" : "false");
}

function formatNumber(value, digits = 2) {
  try {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }

    return numeric.toLocaleString("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  } catch (error) {
    return "--";
  }
}

function formatInteger(value) {
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString("en-IN") : "--";
  } catch (error) {
    return "--";
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showStockError(message) {
  stockErrorBoxEl.textContent = message;
  stockErrorBoxEl.classList.remove("hidden");
}

function hideStockError() {
  stockErrorBoxEl.textContent = "";
  stockErrorBoxEl.classList.add("hidden");
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function readDailyCache() {
  try {
    const raw = localStorage.getItem(STOCK_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dayKey !== getTodayKey() || !parsed.data) {
      return null;
    }

    const cachedStocks = Array.isArray(parsed.data.stocks) ? parsed.data.stocks : [];
    if (cachedStocks.length === 0) {
      return null;
    }

    return parsed.data;
  } catch (error) {
    return null;
  }
}

function writeDailyCache(data) {
  try {
    const rows = Array.isArray(data?.stocks) ? data.stocks : [];
    if (rows.length === 0) {
      return;
    }

    localStorage.setItem(
      STOCK_CACHE_KEY,
      JSON.stringify({
        dayKey: getTodayKey(),
        data
      })
    );
  } catch (error) {
    // Ignore storage issues and continue with live flow.
  }
}

function renderStockRows(stocks) {
  try {
    const rows = Array.isArray(stocks) ? stocks : [];
    if (rows.length === 0) {
      stockTableBodyEl.innerHTML = '<tr><td colspan="10">No bullish stocks found for today.</td></tr>';
      return;
    }

    stockTableBodyEl.innerHTML = rows
      .map((stock) => {
        const trend = stock.Trend === "Bullish" ? "Bullish" : "Bearish";
        const trendClass = trend === "Bullish" ? "stock-trend-bull" : "stock-trend-bear";

        return `
          <tr>
            <td>${escapeHtml(stock.StockName || "--")}</td>
            <td>${formatNumber(stock.CurrentPrice)}</td>
            <td>${formatNumber(stock.TargetPrice)}</td>
            <td>${formatInteger(stock.ExpectedDays)}</td>
            <td class="${trendClass}">${escapeHtml(trend)}</td>
            <td>${formatInteger(stock.Volume)}</td>
            <td>${formatNumber(stock.RSI)}</td>
            <td>${escapeHtml(stock.MACD || "--")}</td>
            <td>${formatNumber(stock.UpsidePercent)}%</td>
            <td>${formatInteger(stock.ConfidenceScore)}</td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    stockTableBodyEl.innerHTML = '<tr><td colspan="10">Unable to render stock details.</td></tr>';
  }
}

function buildMeasuresText(measures) {
  if (!measures || typeof measures !== "object") {
    return "--";
  }

  const parts = [];

  if (Number.isFinite(Number(measures.Rsi))) {
    parts.push(`RSI ${formatNumber(measures.Rsi)}`);
  }

  if (Number.isFinite(Number(measures.DistanceFromEma20Percent))) {
    parts.push(`EMA20 Dist ${formatNumber(measures.DistanceFromEma20Percent)}%`);
  }

  if (Number.isFinite(Number(measures.MacdGapPercent))) {
    parts.push(`MACD Gap ${formatNumber(measures.MacdGapPercent, 3)}%`);
  }

  if (Number.isFinite(Number(measures.VolumeRatio3Day))) {
    parts.push(`Vol Ratio ${formatNumber(measures.VolumeRatio3Day)}x`);
  }

  if (Number.isFinite(Number(measures.Volatility20))) {
    parts.push(`Volatility20 ${formatNumber(measures.Volatility20, 4)}`);
  }

  return parts.join(" | ") || "--";
}

function renderSmallCapRows(stocks) {
  try {
    const rows = Array.isArray(stocks) ? stocks : [];
    if (!smallCapTableBodyEl) {
      return;
    }

    if (rows.length === 0) {
      smallCapTableBodyEl.innerHTML =
        '<tr><td colspan="7">No high-movement small-cap setup found for today.</td></tr>';
      return;
    }

    smallCapTableBodyEl.innerHTML = rows
      .map((stock) => {
        const trend = stock.Trend === "Bullish" ? "Bullish" : "Bearish";
        const trendClass = trend === "Bullish" ? "stock-trend-bull" : "stock-trend-bear";

        return `
          <tr>
            <td>${escapeHtml(stock.StockName || "--")}</td>
            <td>${formatNumber(stock.CurrentPrice)}</td>
            <td class="smallcap-highlight">${formatNumber(stock.TodayMovementPotentialPercent)}%</td>
            <td>${formatInteger(stock.HighMovementScore)}</td>
            <td class="${trendClass}">${escapeHtml(trend)}</td>
            <td class="smallcap-why">${escapeHtml(stock.Why || "--")}</td>
            <td class="smallcap-measures">${escapeHtml(buildMeasuresText(stock.Measures))}</td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    if (smallCapTableBodyEl) {
      smallCapTableBodyEl.innerHTML =
        '<tr><td colspan="7">Unable to render small-cap high movement details.</td></tr>';
    }
  }
}

function applyStockPayload(data, cacheLabel = "") {
  renderStockRows(data.stocks || []);

  const cacheText = cacheLabel ? ` | ${cacheLabel}` : "";
  stockMessageEl.textContent = `${data.message || "Stock details updated."}${cacheText}`;

  const refreshedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
  stockLastUpdatedEl.textContent = `Last update: ${refreshedAt.toLocaleString("en-IN")}`;
}

async function loadSmallCapHighMovement() {
  const response = await fetch("/api/stocks/smallcap-high-movement", {
    method: "GET"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const details = payload.details || payload.error || `Request failed with status ${response.status}`;
    throw new Error(details);
  }

  const data = await response.json();
  renderSmallCapRows(data.stocks || []);
  if (smallCapMessageEl) {
    smallCapMessageEl.textContent = data.message || "Small-cap movement details updated.";
  }
}

async function loadTopStocks(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const showPageProgress = forceRefresh;
  if (showPageProgress) {
    setPageProgress(true, "Searching stock details...");
  }
  setButtonLoading(refreshStocksBtn, true, "Refreshing...", refreshStocksBtnDefaultText);
  hideStockError();

  try {
    const cachedData = forceRefresh ? null : readDailyCache();
    if (cachedData) {
      applyStockPayload(cachedData, "Loaded from today's cache");
      await loadSmallCapHighMovement();
      return;
    }

    const [topStocksResponse] = await Promise.all([
      fetch("/api/stocks/top", {
        method: "GET"
      })
    ]);

    if (!topStocksResponse.ok) {
      const payload = await topStocksResponse.json().catch(() => ({}));
      const details =
        payload.details || payload.error || `Request failed with status ${topStocksResponse.status}`;
      throw new Error(details);
    }

    const data = await topStocksResponse.json();
    applyStockPayload(data);
    await loadSmallCapHighMovement();
    writeDailyCache(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stock data error";
    showStockError(`Unable to fetch stock details. ${message}`);
    stockMessageEl.textContent = "Showing fallback message due to data source issue.";
    stockLastUpdatedEl.textContent = `Last update: ${new Date().toLocaleString("en-IN")}`;
    renderStockRows([]);
    renderSmallCapRows([]);
    if (smallCapMessageEl) {
      smallCapMessageEl.textContent = "Unable to load small-cap high movement suggestions.";
    }
  } finally {
    if (showPageProgress) {
      setPageProgress(false);
    }
    setButtonLoading(refreshStocksBtn, false, "Refreshing...", refreshStocksBtnDefaultText);
  }
}

refreshStocksBtn.addEventListener("click", () => {
  loadTopStocks({ forceRefresh: true }).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    showStockError(`Refresh failed. ${message}`);
  });
});

loadTopStocks().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  showStockError(`Initialization failed. ${message}`);
});

setInterval(() => {
  loadTopStocks().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown auto-refresh error";
    showStockError(`Auto-refresh failed. ${message}`);
  });
}, DAILY_REFRESH_MS);
