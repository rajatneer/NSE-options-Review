const refreshStocksBtn = document.getElementById("refreshStocksBtn");
const stockLastUpdatedEl = document.getElementById("stockLastUpdated");
const stockErrorBoxEl = document.getElementById("stockErrorBox");
const stockMessageEl = document.getElementById("stockMessage");
const stockTableBodyEl = document.getElementById("stockTableBody");

const STOCK_CACHE_KEY = "stockDetailsDailyCacheV2";
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

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

function applyStockPayload(data, cacheLabel = "") {
  renderStockRows(data.stocks || []);

  const cacheText = cacheLabel ? ` | ${cacheLabel}` : "";
  stockMessageEl.textContent = `${data.message || "Stock details updated."}${cacheText}`;

  const refreshedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
  stockLastUpdatedEl.textContent = `Last update: ${refreshedAt.toLocaleString("en-IN")}`;
}

async function loadTopStocks(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  refreshStocksBtn.disabled = true;
  hideStockError();

  try {
    const cachedData = forceRefresh ? null : readDailyCache();
    if (cachedData) {
      applyStockPayload(cachedData, "Loaded from today's cache");
      return;
    }

    const response = await fetch("/api/stocks/top", {
      method: "GET"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const details = payload.details || payload.error || `Request failed with status ${response.status}`;
      throw new Error(details);
    }

    const data = await response.json();
    applyStockPayload(data);
    writeDailyCache(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stock data error";
    showStockError(`Unable to fetch stock details. ${message}`);
    stockMessageEl.textContent = "Showing fallback message due to data source issue.";
    stockLastUpdatedEl.textContent = `Last update: ${new Date().toLocaleString("en-IN")}`;
    renderStockRows([]);
  } finally {
    refreshStocksBtn.disabled = false;
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
