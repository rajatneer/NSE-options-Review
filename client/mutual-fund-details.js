const mfCategoryEl = document.getElementById("mfCategory");
const mfSortByEl = document.getElementById("mfSortBy");
const mfRiskFilterEl = document.getElementById("mfRiskFilter");
const mfHighReturnOnlyEl = document.getElementById("mfHighReturnOnly");
const mfSearchBtn = document.getElementById("mfSearchBtn");
const mfLastUpdatedEl = document.getElementById("mfLastUpdated");
const mfErrorBoxEl = document.getElementById("mfErrorBox");
const mfMessageEl = document.getElementById("mfMessage");
const mfTableBodyEl = document.getElementById("mfTableBody");

const sipAmountEl = document.getElementById("sipAmount");
const sipRateEl = document.getElementById("sipRate");
const sipYearsEl = document.getElementById("sipYears");
const sipCalculateBtnEl = document.getElementById("sipCalculateBtn");
const sipOutputEl = document.getElementById("sipOutput");

const MF_CACHE_KEY = "mutualFundsCacheV1";
const MF_CACHE_TTL_MS = 5 * 60 * 1000;

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

function formatPercent(value) {
  return `${formatNumber(value, 2)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hideMfError() {
  mfErrorBoxEl.textContent = "";
  mfErrorBoxEl.classList.add("hidden");
}

function showMfError(message) {
  mfErrorBoxEl.textContent = message;
  mfErrorBoxEl.classList.remove("hidden");
}

function truncate(text, maxLen = 70) {
  const value = String(text || "");
  if (value.length <= maxLen) {
    return value;
  }

  return `${value.slice(0, maxLen - 3)}...`;
}

function riskClass(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "low") {
    return "mf-risk-low";
  }

  if (normalized === "moderate") {
    return "mf-risk-moderate";
  }

  if (normalized === "high") {
    return "mf-risk-high";
  }

  return "";
}

function writeCache(cacheKey, payload) {
  try {
    localStorage.setItem(
      MF_CACHE_KEY,
      JSON.stringify({
        key: cacheKey,
        timestamp: Date.now(),
        payload
      })
    );
  } catch (error) {
    // Ignore storage failures.
  }
}

function readCache(cacheKey) {
  try {
    const raw = localStorage.getItem(MF_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.key !== cacheKey || !parsed.timestamp || !parsed.payload) {
      return null;
    }

    if (Date.now() - parsed.timestamp > MF_CACHE_TTL_MS) {
      return null;
    }

    return parsed.payload;
  } catch (error) {
    return null;
  }
}

function renderRows(funds) {
  const rows = Array.isArray(funds) ? funds : [];
  if (rows.length === 0) {
    mfTableBodyEl.innerHTML = '<tr><td colspan="10">No data available.</td></tr>';
    return;
  }

  mfTableBodyEl.innerHTML = rows
    .map((fund) => {
      const oneYClass = Number(fund.Returns1Y) > 10 ? "mf-high-return" : "";
      const threeYClass = Number(fund.Returns3Y) > 12 ? "mf-high-return" : "";
      const fiveYClass = Number(fund.Returns5Y) > 12 ? "mf-high-return" : "";
      const why = String(fund.WhyRecommended || "-");

      return `
        <tr>
          <td>${escapeHtml(fund.SchemeName || "--")}</td>
          <td>${formatNumber(fund.NAV)}</td>
          <td class="${oneYClass}">${formatPercent(fund.Returns1Y)}</td>
          <td class="${threeYClass}">${formatPercent(fund.Returns3Y)}</td>
          <td class="${fiveYClass}">${formatPercent(fund.Returns5Y)}</td>
          <td>${formatPercent(fund.ExpenseRatio)}</td>
          <td>${formatNumber(fund.AUM, 0)}</td>
          <td class="${riskClass(fund.RiskLevel)}">${escapeHtml(fund.RiskLevel || "--")}</td>
          <td><span class="mf-why" title="${escapeHtml(why)}">${escapeHtml(truncate(why))}</span></td>
          <td><span class="mf-score-chip">${formatNumber(fund.Score, 0)}</span></td>
        </tr>
      `;
    })
    .join("");
}

async function loadCategories() {
  try {
    const response = await fetch("/api/mutualfunds/categories");
    if (!response.ok) {
      throw new Error(`Category request failed (${response.status})`);
    }

    const categories = await response.json();
    const rows = Array.isArray(categories) ? categories : [];
    if (rows.length === 0) {
      throw new Error("No categories available");
    }

    mfCategoryEl.innerHTML = rows
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");

    mfMessageEl.textContent = "Categories loaded. Click Search Funds.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load categories";
    showMfError(`Unable to load categories. ${message}`);
    mfMessageEl.textContent = "No data available.";
  }
}

async function loadFunds(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const category = String(mfCategoryEl.value || "").trim();
  if (!category) {
    showMfError("Please select a mutual fund category.");
    return;
  }

  hideMfError();
  mfSearchBtn.disabled = true;

  const query = new URLSearchParams({
    category,
    sortBy: String(mfSortByEl.value || "score"),
    riskFilter: String(mfRiskFilterEl.value || "All"),
    highReturnOnly: String(Boolean(mfHighReturnOnlyEl.checked))
  });

  const cacheKey = query.toString();

  try {
    if (!forceRefresh) {
      const cached = readCache(cacheKey);
      if (cached) {
        renderRows(cached.funds || []);
        mfMessageEl.textContent = `${cached.message || "Top funds loaded."} | Loaded from cache`;
        mfLastUpdatedEl.textContent = `Last update: ${new Date(cached.generatedAt || Date.now()).toLocaleString("en-IN")}`;
        return;
      }
    }

    const response = await fetch(`/api/mutualfunds/top?${query.toString()}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.details || payload.error || `Request failed (${response.status})`);
    }

    renderRows(payload.funds || []);
    mfMessageEl.textContent = payload.message || "Top funds loaded.";
    mfLastUpdatedEl.textContent = `Last update: ${new Date(payload.generatedAt || Date.now()).toLocaleString("en-IN")}`;
    writeCache(cacheKey, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch mutual funds";
    showMfError(`No data available. ${message}`);
    mfMessageEl.textContent = "No data available.";
    mfTableBodyEl.innerHTML = '<tr><td colspan="10">No data available.</td></tr>';
  } finally {
    mfSearchBtn.disabled = false;
  }
}

function calculateSip() {
  try {
    const monthly = Number(sipAmountEl.value || 0);
    const annualRate = Number(sipRateEl.value || 0);
    const years = Number(sipYearsEl.value || 0);

    if (!Number.isFinite(monthly) || !Number.isFinite(annualRate) || !Number.isFinite(years)) {
      throw new TypeError("Invalid SIP input");
    }

    if (monthly <= 0 || annualRate < 0 || years <= 0) {
      throw new RangeError("Enter valid positive values");
    }

    const monthlyRate = annualRate / 12 / 100;
    const months = years * 12;

    let maturityValue = 0;
    if (monthlyRate === 0) {
      maturityValue = monthly * months;
    } else {
      maturityValue = monthly * (((1 + monthlyRate) ** months - 1) / monthlyRate) * (1 + monthlyRate);
    }

    const invested = monthly * months;
    const gain = maturityValue - invested;

    sipOutputEl.textContent = `Invested: INR ${formatNumber(invested)} | Estimated Value: INR ${formatNumber(maturityValue)} | Wealth Gain: INR ${formatNumber(gain)}`;
  } catch (error) {
    sipOutputEl.textContent = "Enter valid SIP amount, annual return, and duration.";
  }
}

mfSearchBtn.addEventListener("click", () => {
  loadFunds({ forceRefresh: true });
});

sipCalculateBtnEl.addEventListener("click", calculateSip);

Promise.resolve()
  .then(loadCategories)
  .then(() => loadFunds({ forceRefresh: false }))
  .catch(() => {
    mfMessageEl.textContent = "No data available.";
  });
