function normalizeSortBy(sortBy) {
  const normalized = String(sortBy || "score").trim().toLowerCase();
  if (["score", "returns1y", "returns3y", "returns5y", "risk", "expense"].includes(normalized)) {
    return normalized;
  }

  return "score";
}

function normalizeRiskFilter(riskFilter) {
  const normalized = String(riskFilter || "All").trim().toLowerCase();
  if (normalized === "low") {
    return "Low";
  }

  if (normalized === "moderate") {
    return "Moderate";
  }

  if (normalized === "high") {
    return "High";
  }

  return "All";
}

function riskRank(level) {
  const normalized = String(level || "").trim().toLowerCase();
  if (normalized === "low") {
    return 1;
  }

  if (normalized === "moderate") {
    return 2;
  }

  if (normalized === "high") {
    return 3;
  }

  return 4;
}

function sortFunds(funds, sortBy) {
  const rows = [...funds];

  rows.sort((a, b) => {
    if (sortBy === "returns1y") {
      return b.Returns1Y - a.Returns1Y || b.Score - a.Score;
    }

    if (sortBy === "returns3y") {
      return b.Returns3Y - a.Returns3Y || b.Score - a.Score;
    }

    if (sortBy === "returns5y") {
      return b.Returns5Y - a.Returns5Y || b.Score - a.Score;
    }

    if (sortBy === "expense") {
      return a.ExpenseRatio - b.ExpenseRatio || b.Score - a.Score;
    }

    if (sortBy === "risk") {
      return riskRank(a.RiskLevel) - riskRank(b.RiskLevel) || b.Score - a.Score;
    }

    return b.Score - a.Score || b.Returns5Y - a.Returns5Y || b.Returns3Y - a.Returns3Y;
  });

  return rows;
}

function createMutualFundAnalysisService({ mutualFundDataService, mutualFundScoringService }) {
  if (!mutualFundDataService || typeof mutualFundDataService.getFundsByCategory !== "function") {
    throw new TypeError("mutualFundDataService.getFundsByCategory is required");
  }

  if (!mutualFundScoringService || typeof mutualFundScoringService.scoreFund !== "function") {
    throw new TypeError("mutualFundScoringService.scoreFund is required");
  }

  const cache = new Map();
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function getCache(cacheKey) {
    const item = cache.get(cacheKey);
    if (!item) {
      return null;
    }

    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
      cache.delete(cacheKey);
      return null;
    }

    return item.payload;
  }

  function setCache(cacheKey, payload) {
    cache.set(cacheKey, {
      timestamp: Date.now(),
      payload
    });
  }

  function buildCacheKey(normalizedCategory, sortBy, riskFilter, highReturnOnly) {
    return `${normalizedCategory}:${sortBy}:${riskFilter}:${highReturnOnly}`;
  }

  async function getTopFunds({ category, sortBy, riskFilter, highReturnOnly }) {
    try {
      const categoryValidation = mutualFundDataService.tryNormalizeCategory(category);
      if (!categoryValidation.isValid || !categoryValidation.category) {
        throw new RangeError("Invalid category. Please select a supported mutual fund type.");
      }

      const normalizedCategory = categoryValidation.category;
      const normalizedSortBy = normalizeSortBy(sortBy);
      const normalizedRiskFilter = normalizeRiskFilter(riskFilter);
      const highReturnFlag = Boolean(highReturnOnly);

      const cacheKey = buildCacheKey(
        normalizedCategory,
        normalizedSortBy,
        normalizedRiskFilter,
        highReturnFlag
      );

      const cached = getCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          cache: "HIT"
        };
      }

      const funds = await mutualFundDataService.getFundsByCategory(normalizedCategory);
      if (!Array.isArray(funds) || funds.length === 0) {
        const emptyResponse = {
          category: normalizedCategory,
          sortBy: normalizedSortBy,
          riskFilter: normalizedRiskFilter,
          highReturnOnly: highReturnFlag,
          generatedAt: new Date().toISOString(),
          cache: "MISS",
          message: "No data available for the selected category.",
          funds: []
        };

        setCache(cacheKey, emptyResponse);
        return emptyResponse;
      }

      const avgExpense = funds.reduce((sum, item) => sum + Number(item.ExpenseRatio || 0), 0) / funds.length;
      let scored = funds.map((fund) => mutualFundScoringService.scoreFund(fund, avgExpense));

      if (normalizedRiskFilter !== "All") {
        scored = scored.filter((item) => item.RiskLevel.toLowerCase() === normalizedRiskFilter.toLowerCase());
      }

      if (highReturnFlag) {
        scored = scored.filter(
          (item) => item.Returns1Y > 10 || item.Returns3Y > 12 || item.Returns5Y > 12
        );
      }

      const topFunds = sortFunds(scored, normalizedSortBy).slice(0, 5);

      const response = {
        category: normalizedCategory,
        sortBy: normalizedSortBy,
        riskFilter: normalizedRiskFilter,
        highReturnOnly: highReturnFlag,
        generatedAt: new Date().toISOString(),
        cache: "MISS",
        message:
          topFunds.length > 0
            ? "Top 5 mutual funds generated successfully."
            : "No data available for the selected category and filter criteria.",
        funds: topFunds
      };

      setCache(cacheKey, response);
      return response;
    } catch (error) {
      if (error instanceof RangeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Mutual fund analysis failed: ${error.message}`);
      }

      throw new Error("Mutual fund analysis failed with unknown error");
    }
  }

  return {
    getTopFunds
  };
}

module.exports = {
  createMutualFundAnalysisService
};
