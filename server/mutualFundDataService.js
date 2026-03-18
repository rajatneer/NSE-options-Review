const axios = require("axios");

const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

const SUPPORTED_CATEGORIES = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "ELSS (Tax Saving)",
  "Hybrid",
  "Index Funds"
];

const CATEGORY_ALIASES = {
  "Large Cap": "Large Cap",
  "Mid Cap": "Mid Cap",
  "Small Cap": "Small Cap",
  "Flexi Cap": "Flexi Cap",
  ELSS: "ELSS (Tax Saving)",
  "Tax Saving": "ELSS (Tax Saving)",
  "ELSS (Tax Saving)": "ELSS (Tax Saving)",
  Hybrid: "Hybrid",
  Index: "Index Funds",
  "Index Fund": "Index Funds",
  "Index Funds": "Index Funds"
};

const BASE_FUNDS = [
  { SchemeName: "SBI Bluechip Fund", Category: "Large Cap", NAV: 88.12, ExpenseRatio: 0.89, AUM: 43211, Returns1Y: 13.6, Returns3Y: 14.1, Returns5Y: 13.2, RiskLevel: "Moderate", SharpeRatio: 1.08, Beta: 0.96, Alpha: 2.4 },
  { SchemeName: "ICICI Prudential Bluechip Fund", Category: "Large Cap", NAV: 92.44, ExpenseRatio: 0.91, AUM: 55120, Returns1Y: 14.0, Returns3Y: 14.6, Returns5Y: 13.5, RiskLevel: "Moderate", SharpeRatio: 1.11, Beta: 0.95, Alpha: 2.6 },
  { SchemeName: "HDFC Top 100 Fund", Category: "Large Cap", NAV: 845.26, ExpenseRatio: 0.98, AUM: 28650, Returns1Y: 12.2, Returns3Y: 13.2, Returns5Y: 12.8, RiskLevel: "Moderate", SharpeRatio: 1.02, Beta: 0.98, Alpha: 2.1 },
  { SchemeName: "Nippon India Large Cap Fund", Category: "Large Cap", NAV: 78.65, ExpenseRatio: 0.95, AUM: 21540, Returns1Y: 12.8, Returns3Y: 13.8, Returns5Y: 12.9, RiskLevel: "Moderate", SharpeRatio: 1.04, Beta: 0.97, Alpha: 2.2 },
  { SchemeName: "Axis Bluechip Fund", Category: "Large Cap", NAV: 54.02, ExpenseRatio: 1.0, AUM: 31600, Returns1Y: 10.9, Returns3Y: 11.9, Returns5Y: 11.8, RiskLevel: "Moderate", SharpeRatio: 0.94, Beta: 0.99, Alpha: 1.8 },
  { SchemeName: "Kotak Bluechip Fund", Category: "Large Cap", NAV: 488.9, ExpenseRatio: 0.84, AUM: 6640, Returns1Y: 13.2, Returns3Y: 13.7, Returns5Y: 12.7, RiskLevel: "Moderate", SharpeRatio: 1.05, Beta: 0.94, Alpha: 2.3 },

  { SchemeName: "Kotak Emerging Equity Fund", Category: "Mid Cap", NAV: 77.31, ExpenseRatio: 0.72, AUM: 51230, Returns1Y: 19.0, Returns3Y: 21.2, Returns5Y: 18.4, RiskLevel: "High", SharpeRatio: 1.24, Beta: 0.98, Alpha: 4.1 },
  { SchemeName: "HDFC Mid-Cap Opportunities Fund", Category: "Mid Cap", NAV: 175.4, ExpenseRatio: 0.81, AUM: 62140, Returns1Y: 18.2, Returns3Y: 20.6, Returns5Y: 17.8, RiskLevel: "High", SharpeRatio: 1.2, Beta: 1.0, Alpha: 3.8 },
  { SchemeName: "Motilal Oswal Midcap Fund", Category: "Mid Cap", NAV: 88.52, ExpenseRatio: 0.64, AUM: 25490, Returns1Y: 21.4, Returns3Y: 24.3, Returns5Y: 20.7, RiskLevel: "High", SharpeRatio: 1.31, Beta: 0.97, Alpha: 4.9 },
  { SchemeName: "Nippon India Growth Fund", Category: "Mid Cap", NAV: 3530.14, ExpenseRatio: 0.86, AUM: 31520, Returns1Y: 17.6, Returns3Y: 19.5, Returns5Y: 17.2, RiskLevel: "High", SharpeRatio: 1.17, Beta: 1.03, Alpha: 3.5 },
  { SchemeName: "PGIM India Midcap Opportunities Fund", Category: "Mid Cap", NAV: 62.9, ExpenseRatio: 0.51, AUM: 10730, Returns1Y: 16.8, Returns3Y: 18.7, Returns5Y: 16.1, RiskLevel: "High", SharpeRatio: 1.14, Beta: 0.99, Alpha: 3.1 },
  { SchemeName: "Edelweiss Mid Cap Fund", Category: "Mid Cap", NAV: 80.74, ExpenseRatio: 0.44, AUM: 9100, Returns1Y: 16.5, Returns3Y: 18.2, Returns5Y: 15.9, RiskLevel: "High", SharpeRatio: 1.12, Beta: 0.98, Alpha: 3.0 },

  { SchemeName: "Nippon India Small Cap Fund", Category: "Small Cap", NAV: 148.55, ExpenseRatio: 0.73, AUM: 52210, Returns1Y: 23.9, Returns3Y: 27.1, Returns5Y: 24.5, RiskLevel: "High", SharpeRatio: 1.36, Beta: 1.05, Alpha: 5.7 },
  { SchemeName: "SBI Small Cap Fund", Category: "Small Cap", NAV: 171.88, ExpenseRatio: 0.7, AUM: 28420, Returns1Y: 22.1, Returns3Y: 25.0, Returns5Y: 22.7, RiskLevel: "High", SharpeRatio: 1.29, Beta: 1.04, Alpha: 5.1 },
  { SchemeName: "HDFC Small Cap Fund", Category: "Small Cap", NAV: 121.25, ExpenseRatio: 0.76, AUM: 20110, Returns1Y: 21.8, Returns3Y: 24.7, Returns5Y: 22.3, RiskLevel: "High", SharpeRatio: 1.28, Beta: 1.06, Alpha: 4.9 },
  { SchemeName: "Axis Small Cap Fund", Category: "Small Cap", NAV: 89.41, ExpenseRatio: 0.62, AUM: 17310, Returns1Y: 18.5, Returns3Y: 20.2, Returns5Y: 18.6, RiskLevel: "High", SharpeRatio: 1.15, Beta: 1.01, Alpha: 3.8 },
  { SchemeName: "DSP Small Cap Fund", Category: "Small Cap", NAV: 170.4, ExpenseRatio: 0.67, AUM: 14940, Returns1Y: 19.2, Returns3Y: 21.4, Returns5Y: 19.5, RiskLevel: "High", SharpeRatio: 1.19, Beta: 1.03, Alpha: 4.2 },
  { SchemeName: "Quant Small Cap Fund", Category: "Small Cap", NAV: 252.78, ExpenseRatio: 0.72, AUM: 15980, Returns1Y: 25.2, Returns3Y: 29.0, Returns5Y: 26.1, RiskLevel: "High", SharpeRatio: 1.42, Beta: 1.08, Alpha: 6.2 },

  { SchemeName: "Parag Parikh Flexi Cap Fund", Category: "Flexi Cap", NAV: 79.35, ExpenseRatio: 0.63, AUM: 74810, Returns1Y: 20.1, Returns3Y: 22.7, Returns5Y: 21.4, RiskLevel: "Moderate", SharpeRatio: 1.3, Beta: 0.89, Alpha: 5.4 },
  { SchemeName: "HDFC Flexi Cap Fund", Category: "Flexi Cap", NAV: 1938.71, ExpenseRatio: 0.81, AUM: 60320, Returns1Y: 16.4, Returns3Y: 18.6, Returns5Y: 16.9, RiskLevel: "Moderate", SharpeRatio: 1.16, Beta: 0.94, Alpha: 3.7 },
  { SchemeName: "UTI Flexi Cap Fund", Category: "Flexi Cap", NAV: 344.89, ExpenseRatio: 0.9, AUM: 19870, Returns1Y: 15.3, Returns3Y: 17.4, Returns5Y: 15.8, RiskLevel: "Moderate", SharpeRatio: 1.1, Beta: 0.93, Alpha: 3.1 },
  { SchemeName: "Kotak Flexicap Fund", Category: "Flexi Cap", NAV: 58.37, ExpenseRatio: 0.56, AUM: 48550, Returns1Y: 17.5, Returns3Y: 19.2, Returns5Y: 17.7, RiskLevel: "Moderate", SharpeRatio: 1.18, Beta: 0.92, Alpha: 4.0 },
  { SchemeName: "Canara Robeco Flexi Cap Fund", Category: "Flexi Cap", NAV: 294.22, ExpenseRatio: 0.61, AUM: 11720, Returns1Y: 16.7, Returns3Y: 18.1, Returns5Y: 16.6, RiskLevel: "Moderate", SharpeRatio: 1.14, Beta: 0.9, Alpha: 3.5 },
  { SchemeName: "Franklin India Flexi Cap Fund", Category: "Flexi Cap", NAV: 1245.16, ExpenseRatio: 0.87, AUM: 15200, Returns1Y: 14.4, Returns3Y: 16.2, Returns5Y: 15.1, RiskLevel: "Moderate", SharpeRatio: 1.06, Beta: 0.95, Alpha: 2.8 },

  { SchemeName: "Quant ELSS Tax Saver Fund", Category: "ELSS (Tax Saving)", NAV: 325.28, ExpenseRatio: 0.57, AUM: 7890, Returns1Y: 22.8, Returns3Y: 26.1, Returns5Y: 24.0, RiskLevel: "High", SharpeRatio: 1.38, Beta: 1.03, Alpha: 5.8 },
  { SchemeName: "Mirae Asset ELSS Tax Saver Fund", Category: "ELSS (Tax Saving)", NAV: 43.9, ExpenseRatio: 0.51, AUM: 16700, Returns1Y: 19.1, Returns3Y: 21.5, Returns5Y: 19.8, RiskLevel: "High", SharpeRatio: 1.24, Beta: 0.97, Alpha: 4.6 },
  { SchemeName: "Axis ELSS Tax Saver Fund", Category: "ELSS (Tax Saving)", NAV: 101.33, ExpenseRatio: 0.95, AUM: 35840, Returns1Y: 11.6, Returns3Y: 13.2, Returns5Y: 12.7, RiskLevel: "High", SharpeRatio: 1.0, Beta: 0.99, Alpha: 2.3 },
  { SchemeName: "DSP ELSS Tax Saver Fund", Category: "ELSS (Tax Saving)", NAV: 118.44, ExpenseRatio: 0.61, AUM: 12750, Returns1Y: 16.8, Returns3Y: 18.9, Returns5Y: 17.2, RiskLevel: "High", SharpeRatio: 1.17, Beta: 0.96, Alpha: 3.9 },
  { SchemeName: "SBI Long Term Equity Fund", Category: "ELSS (Tax Saving)", NAV: 386.52, ExpenseRatio: 0.93, AUM: 25810, Returns1Y: 14.9, Returns3Y: 16.8, Returns5Y: 15.6, RiskLevel: "High", SharpeRatio: 1.09, Beta: 0.98, Alpha: 3.2 },
  { SchemeName: "Canara Robeco ELSS Tax Saver", Category: "ELSS (Tax Saving)", NAV: 194.67, ExpenseRatio: 0.68, AUM: 7300, Returns1Y: 15.8, Returns3Y: 17.4, Returns5Y: 16.1, RiskLevel: "High", SharpeRatio: 1.12, Beta: 0.95, Alpha: 3.4 },

  { SchemeName: "ICICI Prudential Equity and Debt Fund", Category: "Hybrid", NAV: 357.05, ExpenseRatio: 0.89, AUM: 41020, Returns1Y: 13.3, Returns3Y: 15.1, Returns5Y: 13.9, RiskLevel: "Moderate", SharpeRatio: 1.12, Beta: 0.84, Alpha: 2.9 },
  { SchemeName: "HDFC Hybrid Equity Fund", Category: "Hybrid", NAV: 98.14, ExpenseRatio: 0.92, AUM: 28240, Returns1Y: 12.6, Returns3Y: 14.3, Returns5Y: 13.1, RiskLevel: "Moderate", SharpeRatio: 1.08, Beta: 0.87, Alpha: 2.6 },
  { SchemeName: "SBI Equity Hybrid Fund", Category: "Hybrid", NAV: 301.38, ExpenseRatio: 0.99, AUM: 72510, Returns1Y: 12.1, Returns3Y: 13.8, Returns5Y: 12.9, RiskLevel: "Moderate", SharpeRatio: 1.04, Beta: 0.88, Alpha: 2.3 },
  { SchemeName: "Kotak Equity Hybrid Fund", Category: "Hybrid", NAV: 62.7, ExpenseRatio: 0.53, AUM: 4560, Returns1Y: 11.4, Returns3Y: 12.9, Returns5Y: 12.1, RiskLevel: "Moderate", SharpeRatio: 1.01, Beta: 0.83, Alpha: 2.1 },
  { SchemeName: "Canara Robeco Equity Hybrid Fund", Category: "Hybrid", NAV: 261.74, ExpenseRatio: 0.59, AUM: 10320, Returns1Y: 12.8, Returns3Y: 14.5, Returns5Y: 13.5, RiskLevel: "Moderate", SharpeRatio: 1.1, Beta: 0.85, Alpha: 2.7 },
  { SchemeName: "Mirae Asset Hybrid Equity Fund", Category: "Hybrid", NAV: 34.88, ExpenseRatio: 0.43, AUM: 7560, Returns1Y: 13.5, Returns3Y: 15.2, Returns5Y: 14.1, RiskLevel: "Moderate", SharpeRatio: 1.13, Beta: 0.82, Alpha: 3.0 },

  { SchemeName: "UTI Nifty 50 Index Fund", Category: "Index Funds", NAV: 186.1, ExpenseRatio: 0.19, AUM: 18870, Returns1Y: 13.7, Returns3Y: 14.9, Returns5Y: 13.8, RiskLevel: "Low", SharpeRatio: 1.07, Beta: 0.98, Alpha: 0.4 },
  { SchemeName: "HDFC Index Fund Nifty 50 Plan", Category: "Index Funds", NAV: 230.44, ExpenseRatio: 0.2, AUM: 13450, Returns1Y: 13.6, Returns3Y: 14.8, Returns5Y: 13.7, RiskLevel: "Low", SharpeRatio: 1.06, Beta: 0.99, Alpha: 0.3 },
  { SchemeName: "ICICI Prudential Nifty 50 Index Fund", Category: "Index Funds", NAV: 165.81, ExpenseRatio: 0.17, AUM: 21920, Returns1Y: 13.8, Returns3Y: 15.0, Returns5Y: 13.9, RiskLevel: "Low", SharpeRatio: 1.08, Beta: 0.97, Alpha: 0.5 },
  { SchemeName: "SBI Nifty Index Fund", Category: "Index Funds", NAV: 176.93, ExpenseRatio: 0.22, AUM: 9680, Returns1Y: 13.4, Returns3Y: 14.6, Returns5Y: 13.5, RiskLevel: "Low", SharpeRatio: 1.05, Beta: 1.0, Alpha: 0.2 },
  { SchemeName: "Nippon India Index Fund Nifty 50 Plan", Category: "Index Funds", NAV: 51.42, ExpenseRatio: 0.24, AUM: 8410, Returns1Y: 13.2, Returns3Y: 14.4, Returns5Y: 13.3, RiskLevel: "Low", SharpeRatio: 1.04, Beta: 0.99, Alpha: 0.2 },
  { SchemeName: "Motilal Oswal Nifty 500 Index Fund", Category: "Index Funds", NAV: 38.95, ExpenseRatio: 0.32, AUM: 5240, Returns1Y: 14.5, Returns3Y: 16.1, Returns5Y: 14.7, RiskLevel: "Moderate", SharpeRatio: 1.12, Beta: 0.96, Alpha: 0.9 }
];

function normalizeCategory(category) {
  try {
    if (typeof category !== "string" || category.trim() === "") {
      throw new TypeError("Category is required");
    }

    const normalized = CATEGORY_ALIASES[category.trim()];
    return typeof normalized === "string" ? normalized : null;
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    return null;
  }
}

function parseAmfiNavMap(payload) {
  try {
    if (typeof payload !== "string" || payload.trim() === "") {
      return new Map();
    }

    const lines = payload.split("\n");
    const navMap = new Map();

    for (const line of lines) {
      const text = String(line || "").trim();
      if (!text.includes(";")) {
        continue;
      }

      const parts = text.split(";");
      if (parts.length < 5) {
        continue;
      }

      const schemeName = String(parts[3] || "").trim();
      const navValue = Number.parseFloat(String(parts[4] || "").trim());
      if (!schemeName || !Number.isFinite(navValue)) {
        continue;
      }

      navMap.set(schemeName.toLowerCase(), navValue);
    }

    return navMap;
  } catch (error) {
    return new Map();
  }
}

function resolveNav(schemeName, navMap) {
  try {
    if (!(navMap instanceof Map) || navMap.size === 0) {
      return null;
    }

    const target = String(schemeName || "").trim().toLowerCase();
    if (!target) {
      return null;
    }

    if (navMap.has(target)) {
      return navMap.get(target);
    }

    for (const [key, value] of navMap.entries()) {
      if (key.includes(target) || target.includes(key)) {
        return value;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

function cloneFund(fund) {
  return {
    SchemeName: fund.SchemeName,
    Category: fund.Category,
    NAV: fund.NAV,
    ExpenseRatio: fund.ExpenseRatio,
    AUM: fund.AUM,
    Returns1Y: fund.Returns1Y,
    Returns3Y: fund.Returns3Y,
    Returns5Y: fund.Returns5Y,
    RiskLevel: fund.RiskLevel,
    SharpeRatio: fund.SharpeRatio,
    Beta: fund.Beta,
    Alpha: fund.Alpha
  };
}

function createMutualFundDataService() {
  const client = axios.create({
    timeout: 20000,
    validateStatus: (status) => status >= 200 && status < 500,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/plain,application/json"
    }
  });

  async function fetchAmfiNavMap() {
    try {
      const response = await client.get(AMFI_NAV_URL);
      if (response.status !== 200 || typeof response.data !== "string") {
        return new Map();
      }

      return parseAmfiNavMap(response.data);
    } catch (error) {
      return new Map();
    }
  }

  function getSupportedCategories() {
    return [...SUPPORTED_CATEGORIES];
  }

  function tryNormalizeCategory(category) {
    const normalized = normalizeCategory(category);
    return {
      isValid: typeof normalized === "string",
      category: normalized
    };
  }

  async function getFundsByCategory(category) {
    try {
      const normalized = normalizeCategory(category);
      if (!normalized) {
        throw new RangeError("Invalid category");
      }

      const funds = BASE_FUNDS.filter((fund) => fund.Category === normalized).map(cloneFund);
      if (funds.length === 0) {
        return [];
      }

      const navMap = await fetchAmfiNavMap();
      return funds.map((fund) => {
        const liveNav = resolveNav(fund.SchemeName, navMap);
        return {
          ...fund,
          NAV: Number.isFinite(liveNav) ? Number(liveNav.toFixed(4)) : fund.NAV
        };
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Mutual fund data fetch failed: ${error.message}`);
      }

      throw new Error("Mutual fund data fetch failed with unknown error");
    }
  }

  return {
    getSupportedCategories,
    tryNormalizeCategory,
    getFundsByCategory
  };
}

module.exports = {
  createMutualFundDataService
};
