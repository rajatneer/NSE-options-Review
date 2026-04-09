const axios = require("axios");

const INVESTING_MAJOR_INDICES_URL = "https://www.investing.com/indices/major-indices";
const TRADINGVIEW_SCANNER_URL = "https://scanner.tradingview.com/india/scan";
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const NSE_BASE_URL = "https://www.nseindia.com";
const FII_DII_API_PATH = "/api/fiidiiTradeReact";
const STOOQ_BASE_URL = "https://stooq.com";

const ECONOMIC_TIMES_RSS_URL = "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms";
const BLOOMBERG_MARKETS_RSS_URL = "https://feeds.bloomberg.com/markets/news.rss";

const BULLISH_KEYWORDS = ["growth", "rally", "buying", "profit", "upgrade"];
const BEARISH_KEYWORDS = ["selloff", "inflation", "rate hike", "war", "crash"];

const SIGNAL_SCORES = {
  BULLISH: 1,
  NEUTRAL: 0,
  BEARISH: -1
};

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculateEma(values, period) {
  try {
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError("EMA values are required");
    }

    const p = Number(period);
    if (!Number.isFinite(p) || p <= 0) {
      throw new RangeError("EMA period must be positive");
    }

    const alpha = 2 / (p + 1);
    let ema = toFiniteNumber(values[0]);
    for (let i = 1; i < values.length; i += 1) {
      const current = toFiniteNumber(values[i], ema);
      ema = alpha * current + (1 - alpha) * ema;
    }

    return ema;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`EMA computation failed: ${error.message}`);
    }

    throw new Error("EMA computation failed with unknown error");
  }
}

function calculateRsi(values, period = 14) {
  try {
    if (!Array.isArray(values) || values.length <= period) {
      throw new RangeError("RSI requires more candles");
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i += 1) {
      const delta = toFiniteNumber(values[i]) - toFiniteNumber(values[i - 1]);
      if (delta >= 0) {
        gains += delta;
      } else {
        losses += Math.abs(delta);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < values.length; i += 1) {
      const delta = toFiniteNumber(values[i]) - toFiniteNumber(values[i - 1]);
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? Math.abs(delta) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return Number((100 - 100 / (1 + rs)).toFixed(2));
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`RSI computation failed: ${error.message}`);
    }

    throw new Error("RSI computation failed with unknown error");
  }
}

async function fetchYahooCloseSeries(symbol, range = "5d", interval = "5m") {
  try {
    const response = await axios.get(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}`, {
      timeout: 12000,
      params: {
        interval,
        range
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "application/json"
      },
      validateStatus: (status) => status >= 200 && status < 500
    });

    if (response.status !== 200 || !response.data) {
      throw new RangeError(`Yahoo chart invalid status (${response.status})`);
    }

    const result = response.data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const close = Array.isArray(quote?.close) ? quote.close : [];
    const values = close
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Number(item));

    if (values.length < 21) {
      throw new RangeError("Yahoo chart returned insufficient candles for EMA 21");
    }

    return values;
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      throw new Error(`Yahoo chart request failed (${error.response?.status || "NoStatus"})`);
    }

    if (error instanceof Error) {
      throw new Error(`Yahoo chart close-series fetch failed: ${error.message}`);
    }

    throw new Error("Yahoo chart close-series fetch failed with unknown error");
  }
}

function normalizeSignal(signal) {
  try {
    if (typeof signal !== "string") {
      throw new TypeError("Signal must be a string");
    }

    const cleaned = signal.trim().toUpperCase();
    if (cleaned === "BULLISH" || cleaned === "BEARISH" || cleaned === "NEUTRAL") {
      return cleaned;
    }

    return "NEUTRAL";
  } catch (error) {
    if (error instanceof TypeError) {
      return "NEUTRAL";
    }

    return "NEUTRAL";
  }
}

function signalToScore(signal) {
  const normalized = normalizeSignal(signal);
  return SIGNAL_SCORES[normalized] ?? 0;
}

function getSentimentColor(sentiment) {
  const normalized = normalizeSignal(sentiment);

  if (normalized === "BULLISH") {
    return "GREEN";
  }

  if (normalized === "BEARISH") {
    return "RED";
  }

  return "YELLOW";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeHtml(input) {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/\s+/g, " ");
}

function parsePercentFromWindow(textWindow) {
  try {
    if (typeof textWindow !== "string" || textWindow.length === 0) {
      throw new TypeError("Percent parse window is empty");
    }

    const percentMatch = textWindow.match(/([+\-]?\d+(?:\.\d+)?)\s*%/);
    if (!percentMatch) {
      throw new RangeError("Unable to find percentage value in text window");
    }

    const parsed = Number(percentMatch[1]);
    if (!Number.isFinite(parsed)) {
      throw new RangeError("Parsed percentage is not finite");
    }

    return parsed;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Failed to parse percentage: ${error.message}`);
    }

    throw new Error("Failed to parse percentage with unknown error");
  }
}

function extractInvestingPercent(html, keywordVariants) {
  try {
    if (typeof html !== "string" || html.length === 0) {
      throw new TypeError("Investing HTML is empty");
    }

    if (!Array.isArray(keywordVariants) || keywordVariants.length === 0) {
      throw new TypeError("Keyword variants are invalid");
    }

    const normalizedHtml = sanitizeHtml(html);
    const lowerHtml = normalizedHtml.toLowerCase();

    for (const keyword of keywordVariants) {
      if (typeof keyword !== "string" || keyword.trim() === "") {
        continue;
      }

      const lowerKeyword = keyword.toLowerCase();
      const index = lowerHtml.indexOf(lowerKeyword);
      if (index < 0) {
        continue;
      }

      const start = Math.max(0, index - 180);
      const end = Math.min(normalizedHtml.length, index + 520);
      const window = normalizedHtml.slice(start, end);

      try {
        return parsePercentFromWindow(window);
      } catch (error) {
        continue;
      }
    }

    throw new RangeError("Unable to locate index row in Investing payload");
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Investing index extraction failed: ${error.message}`);
    }

    throw new Error("Investing index extraction failed with unknown error");
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

function decideThreeIndexSignal(indexValues) {
  try {
    if (!Array.isArray(indexValues) || indexValues.length < 3) {
      throw new TypeError("Index values are invalid");
    }

    const positives = indexValues.filter((value) => value > 0).length;
    const negatives = indexValues.filter((value) => value < 0).length;

    if (positives >= 2) {
      return "BULLISH";
    }

    if (negatives >= 2) {
      return "BEARISH";
    }

    return "NEUTRAL";
  } catch (error) {
    if (error instanceof TypeError) {
      return "NEUTRAL";
    }

    return "NEUTRAL";
  }
}

function buildNseHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
    Referer: `${NSE_BASE_URL}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
  };
}

function normalizeText(input) {
  if (typeof input !== "string") {
    return "";
  }

  return input.toLowerCase();
}

function extractRssTitles(xmlText) {
  try {
    if (typeof xmlText !== "string" || xmlText.trim() === "") {
      throw new TypeError("RSS XML text is empty");
    }

    const titles = [];
    const itemTitleRegex = /<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/gi;

    let itemMatch = itemTitleRegex.exec(xmlText);
    while (itemMatch) {
      const rawTitle = itemMatch[1] || "";
      const cleanTitle = rawTitle
        .replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();

      if (cleanTitle.length > 0) {
        titles.push(cleanTitle);
      }

      itemMatch = itemTitleRegex.exec(xmlText);
    }

    return titles;
  } catch (error) {
    if (error instanceof TypeError) {
      return [];
    }

    return [];
  }
}

function evaluateNewsKeywords(headlines) {
  try {
    if (!Array.isArray(headlines)) {
      throw new TypeError("Headlines must be an array");
    }

    let bullishHits = 0;
    let bearishHits = 0;

    headlines.forEach((headline) => {
      const text = normalizeText(headline);
      if (!text) {
        return;
      }

      BULLISH_KEYWORDS.forEach((keyword) => {
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "gi");
        const matches = text.match(regex);
        bullishHits += matches ? matches.length : 0;
      });

      BEARISH_KEYWORDS.forEach((keyword) => {
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "gi");
        const matches = text.match(regex);
        bearishHits += matches ? matches.length : 0;
      });
    });

    const newsScore = bullishHits - bearishHits;
    let signal = "NEUTRAL";

    if (newsScore >= 2) {
      signal = "BULLISH";
    } else if (newsScore <= -2) {
      signal = "BEARISH";
    }

    return {
      signal,
      newsScore,
      bullishHits,
      bearishHits
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return {
        signal: "NEUTRAL",
        newsScore: 0,
        bullishHits: 0,
        bearishHits: 0
      };
    }

    return {
      signal: "NEUTRAL",
      newsScore: 0,
      bullishHits: 0,
      bearishHits: 0
    };
  }
}

async function fetchTradingViewRows(tickers, columns, screener = "india") {
  try {
    const normalizedScreener =
      typeof screener === "string" && screener.trim() !== "" ? screener.trim().toLowerCase() : "india";
    const scannerUrl =
      normalizedScreener === "india"
        ? TRADINGVIEW_SCANNER_URL
        : `https://scanner.tradingview.com/${normalizedScreener}/scan`;

    const response = await axios.post(
      scannerUrl,
      {
        symbols: {
          tickers,
          query: {
            types: []
          }
        },
        columns
      },
      {
        timeout: 12000,
        headers: {
          "Content-Type": "application/json",
          Origin: "https://in.tradingview.com",
          Referer: "https://in.tradingview.com/"
        },
        validateStatus: (status) => status >= 200 && status < 500
      }
    );

    if (response.status !== 200 || !Array.isArray(response.data?.data)) {
      throw new Error(`TradingView scanner returned invalid payload (${response.status})`);
    }

    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || "NoStatus";
      throw new Error(`TradingView fetch failed (${status})`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("TradingView fetch failed with unknown error");
  }
}

function createMarketSentimentService({ fetchNseOptionChain }) {
  if (typeof fetchNseOptionChain !== "function") {
    throw new TypeError("createMarketSentimentService requires fetchNseOptionChain function");
  }

  async function getGlobalSentiment() {
    try {
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      };

      try {
        const response = await axios.get(INVESTING_MAJOR_INDICES_URL, {
          timeout: 12000,
          headers,
          validateStatus: (status) => status >= 200 && status < 500
        });

        if (response.status !== 200 || typeof response.data !== "string") {
          throw new Error(`Investing response was not valid HTML (${response.status})`);
        }

        const dowJones = extractInvestingPercent(response.data, ["Dow Jones", "US 30", "Dow 30"]);
        const nasdaq = extractInvestingPercent(response.data, ["Nasdaq", "US 100", "Nasdaq 100"]);
        const sp500 = extractInvestingPercent(response.data, ["S&P 500", "US SPX 500", "US500"]);

        const signal = decideThreeIndexSignal([dowJones, nasdaq, sp500]);

        return {
          signal,
          score: signalToScore(signal),
          source: "INVESTING",
          indices: {
            dowJones,
            nasdaq,
            sp500
          },
          fetchedAt: new Date().toISOString()
        };
      } catch (investingError) {
        const stooqClient = axios.create({
          baseURL: STOOQ_BASE_URL,
          timeout: 12000,
          validateStatus: (status) => status >= 200 && status < 500
        });

        const quoteConfigs = [
          { symbol: "^dji", label: "Dow Jones" },
          { symbol: "^ndq", label: "Nasdaq 100" },
          { symbol: "^spx", label: "S&P 500" }
        ];

        const calls = quoteConfigs.map((item) =>
          stooqClient.get(`/q/l/?s=${encodeURIComponent(item.symbol)}&i=d`).then((response) => ({
            label: item.label,
            body: typeof response.data === "string" ? response.data : String(response.data || "")
          }))
        );

        const settled = await Promise.allSettled(calls);
        const parsed = settled
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value)
          .map((item) => {
            try {
              return parseStooqQuote(item.body, item.label);
            } catch (error) {
              return null;
            }
          })
          .filter((item) => item !== null);

        if (parsed.length < 3) {
          throw new Error(
            `Global sentiment unavailable from Investing and fallback failed (${investingError instanceof Error ? investingError.message : "Unknown Investing error"})`
          );
        }

        const dowJones = parsed.find((item) => item.name === "Dow Jones")?.changePercent ?? 0;
        const nasdaq = parsed.find((item) => item.name === "Nasdaq 100")?.changePercent ?? 0;
        const sp500 = parsed.find((item) => item.name === "S&P 500")?.changePercent ?? 0;

        const signal = decideThreeIndexSignal([dowJones, nasdaq, sp500]);

        return {
          signal,
          score: signalToScore(signal),
          source: "STOOQ_FALLBACK",
          indices: {
            dowJones,
            nasdaq,
            sp500
          },
          fetchedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "GLOBAL_UNAVAILABLE",
        indices: {
          dowJones: 0,
          nasdaq: 0,
          sp500: 0
        },
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Global sentiment fetch failed"
      };
    }
  }

  async function getGiftNiftySentiment() {
    try {
      const giftTickers = [
        "NSEIX:GIFTNIFTY",
        "NSEIX:GIFTNIFTY1!",
        "NSE:GIFTNIFTY",
        "SGX:SGXNIFTY",
        "SGX:SGXNIFTY1!"
      ];

      const quoteColumns = ["name", "close", "change", "open", "high", "low"];

      let selected = null;
      let source = "TRADINGVIEW";

      try {
        const rows = await fetchTradingViewRows(giftTickers, quoteColumns, "india");
        selected = rows.find((row) => Array.isArray(row?.d) && Number.isFinite(Number(row.d[1])));
      } catch (error) {
        selected = null;
      }

      if (!selected) {
        try {
          const fallbackRows = await fetchTradingViewRows(
            ["NSE:NIFTY1!", "NSE:NIFTY", "NSE:NIFTY2!"],
            quoteColumns,
            "global"
          );
          selected = fallbackRows.find((row) => Array.isArray(row?.d) && Number.isFinite(Number(row.d[1])));
          source = "TRADINGVIEW_GLOBAL_NIFTY_FUTURES_PROXY";
        } catch (error) {
          selected = null;
        }
      }

      if (!selected) {
        throw new RangeError("Gift Nifty symbol was not available from TradingView scanner (india/global)");
      }

      const currentPrice = toFiniteNumber(selected.d[1]);
      const changePercent = toFiniteNumber(selected.d[2]);
      const previousClose =
        currentPrice > 0 && Number.isFinite(changePercent)
          ? Number((currentPrice / (1 + changePercent / 100)).toFixed(2))
          : 0;
      const pointDifference = Number((currentPrice - previousClose).toFixed(2));

      let signal = "NEUTRAL";
      if (pointDifference > 50) {
        signal = "BULLISH";
      } else if (pointDifference < -50) {
        signal = "BEARISH";
      }

      return {
        signal,
        score: signalToScore(signal),
        source,
        ticker: selected.s || "UNKNOWN",
        currentPrice,
        previousClose,
        pointDifference,
        changePercent,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "TRADINGVIEW_GIFT_UNAVAILABLE",
        ticker: "UNKNOWN",
        currentPrice: 0,
        previousClose: 0,
        pointDifference: 0,
        changePercent: 0,
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Gift Nifty fetch failed"
      };
    }
  }

  async function getOptionChainSentiment() {
    try {
      const nseResponse = await fetchNseOptionChain();
      const rows = nseResponse?.payload?.records?.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new TypeError("Option chain rows are unavailable");
      }

      let highestCallOI = -1;
      let highestPutOI = -1;
      let resistance = 0;
      let support = 0;
      let totalCallOI = 0;
      let totalPutOI = 0;

      rows.forEach((row) => {
        const callOI = toFiniteNumber(row?.CE?.openInterest);
        const putOI = toFiniteNumber(row?.PE?.openInterest);
        const strike = toFiniteNumber(row?.strikePrice);

        totalCallOI += callOI;
        totalPutOI += putOI;

        if (callOI > highestCallOI) {
          highestCallOI = callOI;
          resistance = strike;
        }

        if (putOI > highestPutOI) {
          highestPutOI = putOI;
          support = strike;
        }
      });

      const pcr = totalCallOI > 0 ? Number((totalPutOI / totalCallOI).toFixed(4)) : 0;

      let optionSignal = "NEUTRAL";
      if (highestPutOI > highestCallOI * 1.12) {
        optionSignal = "BULLISH";
      } else if (highestCallOI > highestPutOI * 1.12) {
        optionSignal = "BEARISH";
      }

      let pcrSignal = "NEUTRAL";
      if (pcr > 1.2) {
        pcrSignal = "BULLISH";
      } else if (pcr < 0.8) {
        pcrSignal = "BEARISH";
      }

      return {
        signal: optionSignal,
        score: signalToScore(optionSignal),
        source: nseResponse.source || "NSE_OPTION_CHAIN",
        support,
        resistance,
        highestCallOI: toFiniteNumber(highestCallOI),
        highestPutOI: toFiniteNumber(highestPutOI),
        totalCallOI: Number(totalCallOI.toFixed(2)),
        totalPutOI: Number(totalPutOI.toFixed(2)),
        pcr,
        pcrSignal,
        pcrScore: signalToScore(pcrSignal),
        fallbackExpiry: nseResponse.fallbackExpiry || null,
        cachedAt: nseResponse.cachedAt || null,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "NSE_OPTION_CHAIN_UNAVAILABLE",
        support: 0,
        resistance: 0,
        highestCallOI: 0,
        highestPutOI: 0,
        totalCallOI: 0,
        totalPutOI: 0,
        pcr: 0,
        pcrSignal: "NEUTRAL",
        pcrScore: 0,
        fallbackExpiry: null,
        cachedAt: null,
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Option chain fetch failed"
      };
    }
  }

  async function getFiiDiiSentiment() {
    try {
      const client = axios.create({
        baseURL: NSE_BASE_URL,
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 500
      });

      const response = await client.get(FII_DII_API_PATH, {
        headers: buildNseHeaders()
      });

      if (response.status !== 200 || !Array.isArray(response.data)) {
        throw new TypeError(`NSE FII/DII payload invalid (${response.status})`);
      }

      const fiiRow = response.data.find((item) =>
        String(item?.category || "")
          .toUpperCase()
          .includes("FII")
      );
      if (!fiiRow) {
        throw new RangeError("FII row missing in NSE payload");
      }

      const buyValue = toFiniteNumber(fiiRow.buyValue);
      const sellValue = toFiniteNumber(fiiRow.sellValue);
      const netValue = Number((buyValue - sellValue).toFixed(2));

      let signal = "NEUTRAL";
      if (netValue > 0) {
        signal = "BULLISH";
      } else if (netValue < 0) {
        signal = "BEARISH";
      }

      return {
        signal,
        score: signalToScore(signal),
        source: "NSE_FII_DII",
        date: fiiRow.date || null,
        fiiBuyValue: buyValue,
        fiiSellValue: sellValue,
        fiiNetValue: netValue,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "NSE_FII_DII_UNAVAILABLE",
        date: null,
        fiiBuyValue: 0,
        fiiSellValue: 0,
        fiiNetValue: 0,
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "FII/DII fetch failed"
      };
    }
  }

  async function getTechnicalIndicatorsSentiment() {
    try {
      const rows = await fetchTradingViewRows(["NSE:NIFTY"], ["close", "RSI", "SMA50", "SMA200"]);
      const row = rows[0];
      if (!row || !Array.isArray(row.d) || row.d.length < 4) {
        throw new RangeError("Technical indicator payload is invalid");
      }

      const price = toFiniteNumber(row.d[0]);
      const rsi = toFiniteNumber(row.d[1]);
      const ma50 = toFiniteNumber(row.d[2]);
      const ma200 = toFiniteNumber(row.d[3]);

      let signal = "NEUTRAL";
      if (price > ma50 && rsi > 55) {
        signal = "BULLISH";
      } else if (price < ma50 && rsi < 45) {
        signal = "BEARISH";
      }

      return {
        signal,
        score: signalToScore(signal),
        source: "TRADINGVIEW",
        price,
        rsi,
        ma50,
        ma200,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "TRADINGVIEW_UNAVAILABLE",
        price: 0,
        rsi: 0,
        ma50: 0,
        ma200: 0,
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Technical indicators fetch failed"
      };
    }
  }

  async function getRsiEmaSignal() {
    try {
      const closes = await fetchYahooCloseSeries("^NSEI", "5d", "5m");

      const ema9 = Number(calculateEma(closes, 9).toFixed(2));
      const ema21 = Number(calculateEma(closes, 21).toFixed(2));
      const rsi14 = Number(calculateRsi(closes, 14).toFixed(2));

      let signal = "NEUTRAL";
      let setup = "No-trade / Wait";
      let reason = "EMA trend and RSI momentum are not aligned.";

      if (ema9 > ema21 && rsi14 >= 55) {
        signal = "BULLISH";
        setup = "Bullish setup";
        reason = "EMA 9 is above EMA 21 and RSI(14) confirms momentum (>=55).";
      } else if (ema9 < ema21 && rsi14 <= 45) {
        signal = "BEARISH";
        setup = "Bearish setup";
        reason = "EMA 9 is below EMA 21 and RSI(14) confirms weakness (<=45).";
      }

      return {
        signal,
        score: signalToScore(signal),
        setup,
        reason,
        ema9,
        ema21,
        rsi14,
        candleCount: closes.length,
        source: "YAHOO_CHART",
        symbol: "NIFTY",
        interval: "5m",
        range: "5d",
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        setup: "No-trade / Wait",
        reason: "RSI + EMA signal is unavailable.",
        ema9: 0,
        ema21: 0,
        rsi14: 0,
        candleCount: 0,
        source: "YAHOO_CHART_UNAVAILABLE",
        symbol: "NIFTY",
        interval: "5m",
        range: "5d",
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "RSI + EMA signal fetch failed"
      };
    }
  }

  async function getNewsSentiment() {
    try {
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      };

      const [etResult, bloombergResult] = await Promise.allSettled([
        axios.get(ECONOMIC_TIMES_RSS_URL, {
          timeout: 12000,
          headers,
          validateStatus: (status) => status >= 200 && status < 500
        }),
        axios.get(BLOOMBERG_MARKETS_RSS_URL, {
          timeout: 12000,
          headers,
          validateStatus: (status) => status >= 200 && status < 500
        })
      ]);

      const headlines = [];

      if (etResult.status === "fulfilled" && etResult.value.status === 200) {
        headlines.push(...extractRssTitles(String(etResult.value.data || "")).slice(0, 25));
      }

      if (bloombergResult.status === "fulfilled" && bloombergResult.value.status === 200) {
        headlines.push(...extractRssTitles(String(bloombergResult.value.data || "")).slice(0, 25));
      }

      if (headlines.length === 0) {
        throw new Error("No headlines available from configured RSS feeds");
      }

      const evaluation = evaluateNewsKeywords(headlines);

      return {
        signal: evaluation.signal,
        score: signalToScore(evaluation.signal),
        source: "ECONOMIC_TIMES_BLOOMBERG_RSS",
        newsScore: evaluation.newsScore,
        bullishHits: evaluation.bullishHits,
        bearishHits: evaluation.bearishHits,
        headlineCount: headlines.length,
        topHeadlines: headlines.slice(0, 6),
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        signal: "NEUTRAL",
        score: 0,
        source: "NEWS_UNAVAILABLE",
        newsScore: 0,
        bullishHits: 0,
        bearishHits: 0,
        headlineCount: 0,
        topHeadlines: [],
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "News sentiment fetch failed"
      };
    }
  }

  async function getFinalSentiment() {
    try {
      const [globalSentiment, giftNifty, optionChain, fiiDii, technicalIndicators, rsiEmaSignal, newsSentiment] =
        await Promise.all([
          getGlobalSentiment(),
          getGiftNiftySentiment(),
          getOptionChainSentiment(),
          getFiiDiiSentiment(),
          getTechnicalIndicatorsSentiment(),
          getRsiEmaSignal(),
          getNewsSentiment()
        ]);

      const signals = {
        globalMarket: globalSentiment.signal,
        giftNifty: giftNifty.signal,
        optionChain: optionChain.signal,
        pcr: optionChain.pcrSignal,
        fiiDii: fiiDii.signal,
        technicalIndicators: technicalIndicators.signal,
        rsiEmaSignal: rsiEmaSignal.signal,
        newsSentiment: newsSentiment.signal
      };

      const totalScore =
        signalToScore(signals.globalMarket) +
        signalToScore(signals.giftNifty) +
        signalToScore(signals.optionChain) +
        signalToScore(signals.pcr) +
        signalToScore(signals.fiiDii) +
        signalToScore(signals.technicalIndicators) +
        signalToScore(signals.rsiEmaSignal) +
        signalToScore(signals.newsSentiment);

      let marketSentiment = "NEUTRAL";
      if (totalScore >= 3) {
        marketSentiment = "BULLISH";
      } else if (totalScore <= -3) {
        marketSentiment = "BEARISH";
      }

      return {
        marketSentiment,
        totalScore,
        scoreRange: {
          min: -8,
          max: 8
        },
        colorIndicator: getSentimentColor(marketSentiment),
        signals,
        details: {
          globalMarket: globalSentiment,
          giftNifty,
          optionChain,
          pcr: {
            value: optionChain.pcr,
            signal: optionChain.pcrSignal,
            score: optionChain.pcrScore
          },
          fiiDii,
          technicalIndicators,
          rsiEmaSignal,
          newsSentiment
        },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        marketSentiment: "NEUTRAL",
        totalScore: 0,
        scoreRange: {
          min: -8,
          max: 8
        },
        colorIndicator: "YELLOW",
        signals: {
          globalMarket: "NEUTRAL",
          giftNifty: "NEUTRAL",
          optionChain: "NEUTRAL",
          pcr: "NEUTRAL",
          fiiDii: "NEUTRAL",
          technicalIndicators: "NEUTRAL",
          rsiEmaSignal: "NEUTRAL",
          newsSentiment: "NEUTRAL"
        },
        details: {
          globalMarket: {
            signal: "NEUTRAL",
            score: 0
          },
          giftNifty: {
            signal: "NEUTRAL",
            score: 0
          },
          optionChain: {
            signal: "NEUTRAL",
            score: 0,
            pcr: 0,
            pcrSignal: "NEUTRAL"
          },
          pcr: {
            value: 0,
            signal: "NEUTRAL",
            score: 0
          },
          fiiDii: {
            signal: "NEUTRAL",
            score: 0
          },
          technicalIndicators: {
            signal: "NEUTRAL",
            score: 0
          },
          rsiEmaSignal: {
            signal: "NEUTRAL",
            score: 0,
            setup: "No-trade / Wait",
            reason: "RSI + EMA signal unavailable"
          },
          newsSentiment: {
            signal: "NEUTRAL",
            score: 0
          }
        },
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Final sentiment generation failed"
      };
    }
  }

  return {
    getGlobalSentiment,
    getGiftNiftySentiment,
    getOptionChainSentiment,
    getFiiDiiSentiment,
    getTechnicalIndicatorsSentiment,
    getRsiEmaSignal,
    getNewsSentiment,
    getFinalSentiment
  };
}

module.exports = {
  createMarketSentimentService,
  signalToScore
};
