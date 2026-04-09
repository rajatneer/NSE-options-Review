const path = require("path");
const express = require("express");
const axios = require("axios");
const { analyzeMarket } = require("./analysis");
const { createMarketSentimentService } = require("./marketSentimentService");
const { createHttpMarketClient } = require("./httpMarketClient");
const { createStockAnalysisService } = require("./stockAnalysisService");
const { createMutualFundDataService } = require("./mutualFundDataService");
const { createMutualFundScoringService } = require("./mutualFundScoringService");
const { createMutualFundAnalysisService } = require("./mutualFundAnalysisService");

const app = express();
const PORT = process.env.PORT || 3000;

const NSE_BASE_URL = "https://www.nseindia.com";
const API_PATH = "/api/option-chain-indices?symbol=NIFTY";
const SNAPSHOT_CONTRACTS_PATH = "/api/snapshot-derivatives-equity?index=contracts&limit=5000";
const SNAPSHOT_OI_PATH = "/api/snapshot-derivatives-equity?index=oi&limit=5000";
const STOOQ_BASE_URL = "https://stooq.com";
const OPTION_CHAIN_CACHE_TTL_MS = 20 * 60 * 1000;

let optionChainCache = null;

const GLOBAL_INDEX_SYMBOLS = [
  { symbol: "^spx", label: "S&P 500" },
  { symbol: "^dji", label: "Dow Jones" },
  { symbol: "^ndq", label: "Nasdaq 100" },
  { symbol: "^ukx", label: "FTSE 100" },
  { symbol: "^dax", label: "DAX" },
  { symbol: "^hsi", label: "Hang Seng" },
  { symbol: "^nkx", label: "Nikkei 225" }
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasOptionRows(payload) {
  const recordRows = payload?.records?.data;
  const filteredRows = payload?.filtered?.data;

  return (
    (Array.isArray(recordRows) && recordRows.length > 0) ||
    (Array.isArray(filteredRows) && filteredRows.length > 0)
  );
}

function updateOptionChainCache(payload) {
  try {
    if (!payload || typeof payload !== "object") {
      throw new TypeError("Option chain payload is invalid for cache");
    }

    optionChainCache = {
      payload,
      cachedAt: new Date().toISOString(),
      timestamp: Date.now()
    };
  } catch (error) {
    console.error("[CACHE_UPDATE_ERROR]", error);
  }
}

function getFreshOptionChainCache() {
  try {
    if (!optionChainCache) {
      return null;
    }

    if (Date.now() - optionChainCache.timestamp > OPTION_CHAIN_CACHE_TTL_MS) {
      return null;
    }

    return optionChainCache;
  } catch (error) {
    console.error("[CACHE_READ_ERROR]", error);
    return null;
  }
}

function parseStooqQuote(rawLine, label) {
  try {
    if (typeof rawLine !== "string" || rawLine.trim() === "") {
      throw new TypeError("Stooq quote line is empty");
    }

    const fields = rawLine.trim().split(",");
    if (fields.length < 7) {
      throw new RangeError("Stooq quote has insufficient fields");
    }

    const open = Number(fields[3]);
    const close = Number(fields[6]);

    if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0) {
      throw new RangeError("Stooq quote has invalid OHLC values");
    }

    const changePercent = ((close - open) / open) * 100;
    return {
      name: label,
      open,
      close,
      changePercent: Number(changePercent.toFixed(3))
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Stooq quote parsing failed: ${error.message}`);
    }

    throw new Error("Stooq quote parsing failed with unknown error");
  }
}

async function fetchGlobalSentiment() {
  const client = axios.create({
    baseURL: STOOQ_BASE_URL,
    timeout: 12000,
    validateStatus: (status) => status >= 200 && status < 500
  });

  try {
    const quoteCalls = GLOBAL_INDEX_SYMBOLS.map((item) =>
      client.get(`/q/l/?s=${encodeURIComponent(item.symbol)}&i=d`).then((response) => ({
        label: item.label,
        status: response.status,
        body: typeof response.data === "string" ? response.data : String(response.data || "")
      }))
    );

    const settled = await Promise.allSettled(quoteCalls);
    const parsedMarkets = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((item) => item.status === 200 && !item.body.includes("N/D"))
      .map((item) => {
        try {
          return parseStooqQuote(item.body, item.label);
        } catch (error) {
          return null;
        }
      })
      .filter((item) => item !== null);

    if (parsedMarkets.length < 3) {
      return {
        bias: "NEUTRAL",
        averageChange: 0,
        source: "STOOQ_UNAVAILABLE",
        markets: []
      };
    }

    const averageChange =
      parsedMarkets.reduce((sum, item) => sum + item.changePercent, 0) / parsedMarkets.length;

    let bias = "NEUTRAL";
    if (averageChange > 0.15) {
      bias = "BULLISH";
    } else if (averageChange < -0.15) {
      bias = "BEARISH";
    }

    return {
      bias,
      averageChange: Number(averageChange.toFixed(3)),
      source: "STOOQ",
      markets: parsedMarkets
    };
  } catch (error) {
    console.error("[GLOBAL_SENTIMENT_ERROR]", error);
    return {
      bias: "NEUTRAL",
      averageChange: 0,
      source: "STOOQ_ERROR",
      markets: []
    };
  }
}

function parseNseExpiryDate(dateText) {
  try {
    if (typeof dateText !== "string" || dateText.trim() === "") {
      throw new TypeError("Invalid NSE expiry date text");
    }

    const parsed = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) {
      throw new RangeError(`Unable to parse NSE expiry date: ${dateText}`);
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Expiry parsing failed: ${error.message}`);
    }

    throw new Error("Expiry parsing failed with unknown error");
  }
}

function transformSnapshotToOptionChain(snapshotPayload) {
  try {
    const rows = snapshotPayload?.volume?.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError("Snapshot payload missing volume.data rows");
    }

    const dedupedRows = [...new Map(rows.map((row) => [row.identifier, row])).values()];

    const optionRows = dedupedRows.filter(
      (row) =>
        row &&
        row.instrumentType === "OPTIDX" &&
        row.underlying === "NIFTY" &&
        (row.optionType === "Call" || row.optionType === "Put")
    );

    if (optionRows.length === 0) {
      throw new RangeError("Snapshot payload has no NIFTY OPTIDX rows");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uniqueExpiries = [...new Set(optionRows.map((row) => row.expiryDate))]
      .filter((value) => typeof value === "string" && value.length > 0)
      .map((value) => ({
        text: value,
        date: parseNseExpiryDate(value)
      }))
      .sort((a, b) => a.date - b.date);

    if (uniqueExpiries.length === 0) {
      throw new RangeError("Snapshot payload has no parseable expiries");
    }

    const nearest = uniqueExpiries.find((item) => item.date >= today) || uniqueExpiries[0];

    const nearestRows = optionRows.filter((row) => row.expiryDate === nearest.text);
    if (nearestRows.length === 0) {
      throw new RangeError("Snapshot nearest expiry has no rows");
    }

    const strikeMap = new Map();
    let underlyingValue = 0;

    nearestRows.forEach((row) => {
      const strike = Number(row.strikePrice);
      if (!Number.isFinite(strike)) {
        return;
      }

      underlyingValue = Number(row.underlyingValue) || underlyingValue;

      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          strikePrice: strike
        });
      }

      const item = strikeMap.get(strike);
      const optionNode = {
        openInterest: Number(row.openInterest) || 0,
        changeinOpenInterest: Number(row.changeinOpenInterest || row.changeInOpenInterest) || 0,
        totalTradedVolume: Number(row.numberOfContractsTraded) || 0
      };

      if (row.optionType === "Call") {
        item.CE = optionNode;
      } else if (row.optionType === "Put") {
        item.PE = optionNode;
      }
    });

    const transformedRows = [...strikeMap.values()].sort((a, b) => a.strikePrice - b.strikePrice);
    if (transformedRows.length === 0) {
      throw new RangeError("Snapshot transform produced zero strike rows");
    }

    return {
      payload: {
        records: {
          underlyingValue,
          data: transformedRows
        }
      },
      source: "NSE_SNAPSHOT_FALLBACK",
      fallbackExpiry: nearest.text
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Snapshot transform failed: ${error.message}`);
    }

    throw new Error("Snapshot transform failed with unknown error");
  }
}

function buildHeaders(cookie = "") {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
    Referer: `${NSE_BASE_URL}/option-chain`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    ...(cookie ? { Cookie: cookie } : {})
  };
}

function extractCookieHeader(setCookieHeader) {
  try {
    if (!Array.isArray(setCookieHeader)) {
      throw new TypeError("Set-Cookie header is not an array");
    }

    return setCookieHeader
      .map((cookieString) => cookieString.split(";")[0])
      .join("; ");
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Cookie extraction failed: ${error.message}`);
    }

    throw new Error("Cookie extraction failed with unknown error");
  }
}

async function bootstrapCookies(client) {
  try {
    const homeResponse = await client.get("/", {
      headers: buildHeaders()
    });
    const pageResponse = await client.get("/option-chain", {
      headers: buildHeaders()
    });

    const setCookieHeader = [
      ...(homeResponse.headers["set-cookie"] || []),
      ...(pageResponse.headers["set-cookie"] || [])
    ];
    return extractCookieHeader(setCookieHeader || []);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || "NoStatus";
      throw new Error(`NSE cookie bootstrap request failed (${status})`);
    }

    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`NSE cookie bootstrap failed: ${error.message}`);
    }

    throw new Error("NSE cookie bootstrap failed with unknown error");
  }
}

async function fetchNseOptionChain() {
  const client = axios.create({
    baseURL: NSE_BASE_URL,
    timeout: 20000,
    validateStatus: (status) => status >= 200 && status < 500
  });

  try {
    let lastStatus = "NoStatus";
    let lastBodyHint = "No response body";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const cookie = await bootstrapCookies(client);
      const response = await client.get(`${API_PATH}&_=${Date.now()}`, {
        headers: buildHeaders(cookie)
      });

      lastStatus = response.status;
      lastBodyHint = JSON.stringify(response.data || {}).slice(0, 300);

      if (response.status === 200 && response.data && hasOptionRows(response.data)) {
        updateOptionChainCache(response.data);
        return {
          payload: response.data,
          source: "NSE_OPTION_CHAIN"
        };
      }

      await sleep(450 * attempt);
    }

    const cachedChain = getFreshOptionChainCache();
    if (cachedChain) {
      return {
        payload: cachedChain.payload,
        source: "NSE_OPTION_CHAIN_CACHE",
        cachedAt: cachedChain.cachedAt
      };
    }

    const [contractsResponse, oiResponse] = await Promise.all([
      client.get(`${SNAPSHOT_CONTRACTS_PATH}&_=${Date.now()}`, {
        headers: buildHeaders("")
      }),
      client.get(`${SNAPSHOT_OI_PATH}&_=${Date.now()}`, {
        headers: buildHeaders("")
      })
    ]);

    if (
      contractsResponse.status !== 200 ||
      !contractsResponse.data ||
      oiResponse.status !== 200 ||
      !oiResponse.data
    ) {
      throw new Error(
        `NSE returned empty/blocked option payload and fallback failed (contracts ${contractsResponse.status}, oi ${oiResponse.status})`
      );
    }

    const mergedSnapshotPayload = {
      volume: {
        data: [
          ...(contractsResponse.data.volume?.data || []),
          ...(oiResponse.data.volume?.data || [])
        ]
      }
    };

    const transformed = transformSnapshotToOptionChain(mergedSnapshotPayload);
    return transformed;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || "NoStatus";
      const details = error.response?.data ? JSON.stringify(error.response.data) : "No body";
      throw new Error(`Failed to fetch NSE option chain (${status}) - ${details}`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to fetch NSE option chain with unknown error");
  }
}

const marketSentimentService = createMarketSentimentService({
  fetchNseOptionChain
});

const httpMarketClient = createHttpMarketClient();
const stockAnalysisService = createStockAnalysisService({
  httpMarketClient
});
const mutualFundDataService = createMutualFundDataService();
const mutualFundScoringService = createMutualFundScoringService();
const mutualFundAnalysisService = createMutualFundAnalysisService({
  mutualFundDataService,
  mutualFundScoringService
});

function handleApiError(res, scope, error) {
  const message = error instanceof Error ? error.message : `Unexpected ${scope} error`;
  console.error(`[${scope.toUpperCase()}_ERROR]`, message, error);
  res.status(500).json({
    error: `${scope} failed`,
    details: message
  });
}

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/health", (req, res) => {
  try {
    res.json({
      status: "ok",
      service: "nse-option-analyzer",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected health check error";
    console.error("[HEALTH_ERROR]", message, error);
    res.status(500).json({
      status: "error",
      details: message
    });
  }
});

app.get("/analyze", async (req, res) => {
  try {
    const [nseResponse, globalSentiment, sentimentEngine] = await Promise.all([
      fetchNseOptionChain(),
      fetchGlobalSentiment(),
      marketSentimentService.getFinalSentiment()
    ]);

    const analysis = analyzeMarket(nseResponse.payload, {
      globalSentiment,
      marketSentimentAnalyzer: sentimentEngine,
      dataSource: nseResponse.source
    });

    res.json({
      pcr: analysis.pcr,
      support: analysis.support,
      resistance: analysis.resistance,
      callBuildup: analysis.callBuildup,
      putBuildup: analysis.putBuildup,
      volumeRatio: analysis.volumeRatio,
      prediction: analysis.prediction,
      marketBias: analysis.marketBias,
      predictionConfidence: analysis.predictionConfidence,
      predictionBasis: analysis.predictionBasis,
      predictionReason: analysis.predictionReason,
      buildupSignal: analysis.buildupSignal,
      buildupMode: analysis.buildupMode,
      tradeSetup: analysis.tradeSetup,
      marketSentimentAnalyzer: analysis.marketSentimentAnalyzer,
      globalSentiment: analysis.globalSentiment,
      dataQuality: analysis.dataQuality,
      currentPrice: analysis.currentPrice,
      lastUpdated: analysis.analyzedAt,
      strikes: analysis.strikes,
      dataSource: nseResponse.source,
      fallbackExpiry: nseResponse.fallbackExpiry || null,
      cachedAt: nseResponse.cachedAt || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("[ANALYZE_ERROR]", message, error);

    const status = message.includes("NSE") ? 502 : 500;

    res.status(status).json({
      error: "Analysis failed",
      details: message
    });
  }
});

app.get("/api/global-sentiment", async (req, res) => {
  try {
    const payload = await marketSentimentService.getGlobalSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "global-sentiment", error);
  }
});

app.get("/api/gift-nifty", async (req, res) => {
  try {
    const payload = await marketSentimentService.getGiftNiftySentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "gift-nifty", error);
  }
});

app.get("/api/option-chain", async (req, res) => {
  try {
    const payload = await marketSentimentService.getOptionChainSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "option-chain", error);
  }
});

app.get("/api/fii-dii", async (req, res) => {
  try {
    const payload = await marketSentimentService.getFiiDiiSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "fii-dii", error);
  }
});

app.get("/api/technical-indicators", async (req, res) => {
  try {
    const payload = await marketSentimentService.getTechnicalIndicatorsSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "technical-indicators", error);
  }
});

app.get("/api/news-sentiment", async (req, res) => {
  try {
    const payload = await marketSentimentService.getNewsSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "news-sentiment", error);
  }
});

app.get("/api/final-sentiment", async (req, res) => {
  try {
    const payload = await marketSentimentService.getFinalSentiment();
    res.json(payload);
  } catch (error) {
    handleApiError(res, "final-sentiment", error);
  }
});

app.get("/api/stocks/top", async (req, res) => {
  try {
    const payload = await stockAnalysisService.getTopStocks(5);
    res.json(payload);
  } catch (error) {
    handleApiError(res, "stocks-top", error);
  }
});

app.get("/api/stocks/smallcap-high-movement", async (req, res) => {
  try {
    const payload = await stockAnalysisService.getSmallCapHighMovement(5);
    res.json(payload);
  } catch (error) {
    handleApiError(res, "stocks-smallcap-high-movement", error);
  }
});

app.get("/api/mutualfunds/categories", (req, res) => {
  try {
    const categories = mutualFundDataService.getSupportedCategories();
    res.json(categories);
  } catch (error) {
    handleApiError(res, "mutualfund-categories", error);
  }
});

app.get("/api/mutualfunds/top", async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    if (!category) {
      res.status(400).json({
        error: "mutualfund-top failed",
        details: "Category is required."
      });
      return;
    }

    const sortBy = String(req.query.sortBy || "score").trim();
    const riskFilter = String(req.query.riskFilter || "All").trim();
    const highReturnOnly = String(req.query.highReturnOnly || "false").trim().toLowerCase() === "true";

    const payload = await mutualFundAnalysisService.getTopFunds({
      category,
      sortBy,
      riskFilter,
      highReturnOnly
    });

    res.json(payload);
  } catch (error) {
    if (error instanceof RangeError) {
      res.status(400).json({
        error: "mutualfund-top failed",
        details: error.message
      });
      return;
    }

    handleApiError(res, "mutualfund-top", error);
  }
});

app.get("*", (req, res) => {
  try {
    res.sendFile(path.join(__dirname, "..", "client", "index.html"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected file serving error";
    console.error("[STATIC_ERROR]", message, error);
    res.status(500).send("Unable to load dashboard");
  }
});

app.listen(PORT, () => {
  console.log(`NSE analyzer running on http://localhost:${PORT}`);
});
