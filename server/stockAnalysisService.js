function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateEmaSeries(values, period) {
  try {
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError("EMA input values are required");
    }

    const normalizedPeriod = Number(period);
    if (!Number.isFinite(normalizedPeriod) || normalizedPeriod <= 0) {
      throw new RangeError("EMA period must be a positive number");
    }

    const alpha = 2 / (normalizedPeriod + 1);
    const result = [];
    let previousEma = toFiniteNumber(values[0], 0);

    for (let i = 0; i < values.length; i += 1) {
      const current = toFiniteNumber(values[i], previousEma);
      if (i === 0) {
        previousEma = current;
      } else {
        previousEma = alpha * current + (1 - alpha) * previousEma;
      }

      result.push(previousEma);
    }

    return result;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`EMA calculation failed: ${error.message}`);
    }

    throw new Error("EMA calculation failed with unknown error");
  }
}

function calculateRsi(values, period = 14) {
  try {
    if (!Array.isArray(values) || values.length <= period) {
      return 50;
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

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i += 1) {
      const delta = toFiniteNumber(values[i]) - toFiniteNumber(values[i - 1]);
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? Math.abs(delta) : 0;

      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }

    if (averageLoss === 0) {
      return 100;
    }

    const rs = averageGain / averageLoss;
    const rsi = 100 - 100 / (1 + rs);
    return Number(clamp(rsi, 0, 100).toFixed(2));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`RSI calculation failed: ${error.message}`);
    }

    throw new Error("RSI calculation failed with unknown error");
  }
}

function calculateMacd(values) {
  try {
    if (!Array.isArray(values) || values.length < 35) {
      throw new RangeError("Not enough candle history to calculate MACD");
    }

    const ema12 = calculateEmaSeries(values, 12);
    const ema26 = calculateEmaSeries(values, 26);
    const macdSeries = ema12.map((value, index) => value - ema26[index]);
    const signalSeries = calculateEmaSeries(macdSeries, 9);

    const lastIndex = macdSeries.length - 1;
    const prevIndex = Math.max(0, lastIndex - 1);

    const macdLine = toFiniteNumber(macdSeries[lastIndex], 0);
    const signalLine = toFiniteNumber(signalSeries[lastIndex], 0);
    const previousMacd = toFiniteNumber(macdSeries[prevIndex], macdLine);
    const previousSignal = toFiniteNumber(signalSeries[prevIndex], signalLine);

    const bullishCrossover = macdLine > signalLine && previousMacd <= previousSignal;

    return {
      macdLine,
      signalLine,
      previousMacd,
      previousSignal,
      bullishCrossover
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        macdLine: 0,
        signalLine: 0,
        previousMacd: 0,
        previousSignal: 0,
        bullishCrossover: false
      };
    }

    if (error instanceof Error) {
      throw new Error(`MACD calculation failed: ${error.message}`);
    }

    throw new Error("MACD calculation failed with unknown error");
  }
}

function calculateVolatility(closeSeries) {
  try {
    if (!Array.isArray(closeSeries) || closeSeries.length < 6) {
      return 0;
    }

    const returns = [];
    for (let i = 1; i < closeSeries.length; i += 1) {
      const prev = toFiniteNumber(closeSeries[i - 1], 0);
      const current = toFiniteNumber(closeSeries[i], 0);
      if (prev <= 0 || current <= 0) {
        continue;
      }

      returns.push((current - prev) / prev);
    }

    if (returns.length === 0) {
      return 0;
    }

    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / returns.length;

    return Math.sqrt(variance);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Volatility calculation failed: ${error.message}`);
    }

    throw new Error("Volatility calculation failed with unknown error");
  }
}

function parseYahooChartSeries(payload) {
  try {
    const result = payload?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];

    const close = Array.isArray(quote?.close) ? quote.close : [];
    const volume = Array.isArray(quote?.volume) ? quote.volume : [];

    if (close.length === 0) {
      throw new TypeError("Yahoo payload missing close series");
    }

    const points = [];
    for (let i = 0; i < close.length; i += 1) {
      const closeValue = Number(close[i]);
      if (!Number.isFinite(closeValue) || closeValue <= 0) {
        continue;
      }

      points.push({
        close: closeValue,
        volume: toFiniteNumber(volume[i], 0)
      });
    }

    if (points.length < 35) {
      throw new RangeError("Insufficient valid points in Yahoo series");
    }

    return points;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Yahoo chart parse failed: ${error.message}`);
    }

    throw new Error("Yahoo chart parse failed with unknown error");
  }
}

function buildStockRecord(symbolConfig, points) {
  try {
    if (!symbolConfig || typeof symbolConfig !== "object") {
      throw new TypeError("Stock symbol config is required");
    }

    if (!Array.isArray(points) || points.length < 35) {
      throw new RangeError("Stock chart points are insufficient");
    }

    const closeSeries = points.map((item) => item.close);
    const ema20Series = calculateEmaSeries(closeSeries, 20);

    const currentPrice = toFiniteNumber(closeSeries[closeSeries.length - 1], 0);
    const ema20 = toFiniteNumber(ema20Series[ema20Series.length - 1], currentPrice);
    const rsi = calculateRsi(closeSeries, 14);
    const macd = calculateMacd(closeSeries);

    const latestVolume = toFiniteNumber(points[points.length - 1]?.volume, 0);
    const previousVolume = toFiniteNumber(points[points.length - 2]?.volume, 0);
    const thirdVolume = toFiniteNumber(points[points.length - 3]?.volume, 0);

    const increasingVolume = latestVolume > previousVolume && previousVolume > thirdVolume;
    const oneDayVolumeUp = latestVolume > previousVolume;
    const aboveEma20 = currentPrice > ema20;
    const validRsiRange = rsi >= 50 && rsi <= 70;
    const supportiveRsi = rsi >= 50 && rsi <= 75;
    const macdBullish = macd.bullishCrossover;
    const macdAboveSignal = macd.macdLine >= macd.signalLine;

    const bullishSignScore = [aboveEma20, macdAboveSignal, supportiveRsi, oneDayVolumeUp].filter(
      Boolean
    ).length;

    const trend = bullishSignScore >= 1 ? "Bullish" : "Bearish";

    const rsiMomentum = clamp((rsi - 50) / 20, 0, 1);
    const macdMomentum = clamp((macd.macdLine - macd.signalLine) / Math.max(currentPrice * 0.008, 0.0001), 0, 1);
    const volumeMomentum =
      thirdVolume > 0 && previousVolume > 0
        ? clamp((latestVolume / thirdVolume - 1) / 0.7, 0, 1)
        : increasingVolume
          ? 0.55
          : 0;
    const emaMomentum = ema20 > 0 ? clamp((currentPrice - ema20) / (ema20 * 0.04), 0, 1) : 0;

    const momentum =
      rsiMomentum * 0.3 +
      macdMomentum * 0.3 +
      volumeMomentum * 0.2 +
      emaMomentum * 0.2;

    const upsidePercent = Number((5 + momentum * 7).toFixed(2));
    const targetPrice = Number((currentPrice * (1 + upsidePercent / 100)).toFixed(2));

    const volatility = calculateVolatility(closeSeries.slice(-20));
    const volScale = clamp(volatility / 0.035, 0, 1);
    const expectedDays = Math.max(3, Math.min(10, Math.round(10 - volScale * 7)));

    let confidence = 22;
    if (validRsiRange) {
      confidence += 20;
    }

    if (macdBullish) {
      confidence += 24;
    }

    if (increasingVolume) {
      confidence += 18;
    }

    if (aboveEma20) {
      confidence += 18;
    }

    confidence += Math.round(momentum * 18);
    confidence = Math.max(0, Math.min(100, confidence));

    return {
      StockName: symbolConfig.stockName,
      CurrentPrice: currentPrice,
      TargetPrice: targetPrice,
      ExpectedDays: expectedDays,
      Trend: trend,
      Volume: Math.round(latestVolume),
      RSI: Number(rsi.toFixed(2)),
      MACD: macdBullish ? "Bullish Crossover" : macdAboveSignal ? "Above Signal" : "Bearish/Neutral",
      UpsidePercent: upsidePercent,
      ConfidenceScore: confidence,
      BullishSignScore: bullishSignScore,
      IsBullishCandidate: validRsiRange && macdBullish && increasingVolume && aboveEma20
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Stock record build failed: ${error.message}`);
    }

    throw new Error("Stock record build failed with unknown error");
  }
}

function getFallbackStocks() {
  return [
    {
      StockName: "Reliance Industries",
      CurrentPrice: 1408.1,
      TargetPrice: 1492.59,
      ExpectedDays: 7,
      Trend: "Bullish",
      Volume: 6425011,
      RSI: 58.2,
      MACD: "Bullish Crossover",
      UpsidePercent: 6,
      ConfidenceScore: 73,
      IsBullishCandidate: true
    },
    {
      StockName: "ICICI Bank",
      CurrentPrice: 1224.55,
      TargetPrice: 1304.14,
      ExpectedDays: 6,
      Trend: "Bullish",
      Volume: 7319204,
      RSI: 61.41,
      MACD: "Bullish Crossover",
      UpsidePercent: 6.5,
      ConfidenceScore: 76,
      IsBullishCandidate: true
    },
    {
      StockName: "Larsen & Toubro",
      CurrentPrice: 3598.45,
      TargetPrice: 3904.32,
      ExpectedDays: 8,
      Trend: "Bullish",
      Volume: 1120835,
      RSI: 55.9,
      MACD: "Bullish Crossover",
      UpsidePercent: 8.5,
      ConfidenceScore: 79,
      IsBullishCandidate: true
    },
    {
      StockName: "HDFC Bank",
      CurrentPrice: 1714.35,
      TargetPrice: 1826.51,
      ExpectedDays: 7,
      Trend: "Bullish",
      Volume: 5593021,
      RSI: 57.18,
      MACD: "Bullish Crossover",
      UpsidePercent: 6.54,
      ConfidenceScore: 72,
      IsBullishCandidate: true
    },
    {
      StockName: "Infosys",
      CurrentPrice: 1688.4,
      TargetPrice: 1823.47,
      ExpectedDays: 8,
      Trend: "Bullish",
      Volume: 3980542,
      RSI: 54.37,
      MACD: "Bullish Crossover",
      UpsidePercent: 8,
      ConfidenceScore: 74,
      IsBullishCandidate: true
    }
  ];
}

function createStockAnalysisService({ httpMarketClient, symbols }) {
  if (!httpMarketClient || typeof httpMarketClient.getYahooChart !== "function") {
    throw new TypeError("createStockAnalysisService requires httpMarketClient.getYahooChart function");
  }

  const defaultSymbols = Array.isArray(symbols) && symbols.length > 0
    ? symbols
    : [
        { symbol: "RELIANCE.NS", stockName: "Reliance Industries" },
        { symbol: "TCS.NS", stockName: "TCS" },
        { symbol: "INFY.NS", stockName: "Infosys" },
        { symbol: "HDFCBANK.NS", stockName: "HDFC Bank" },
        { symbol: "ICICIBANK.NS", stockName: "ICICI Bank" },
        { symbol: "LT.NS", stockName: "Larsen & Toubro" },
        { symbol: "SBIN.NS", stockName: "State Bank of India" },
        { symbol: "BHARTIARTL.NS", stockName: "Bharti Airtel" },
        { symbol: "HINDUNILVR.NS", stockName: "Hindustan Unilever" },
        { symbol: "BAJFINANCE.NS", stockName: "Bajaj Finance" },
        { symbol: "ASIANPAINT.NS", stockName: "Asian Paints" },
        { symbol: "MARUTI.NS", stockName: "Maruti Suzuki" },
        { symbol: "KOTAKBANK.NS", stockName: "Kotak Mahindra Bank" },
        { symbol: "SUNPHARMA.NS", stockName: "Sun Pharma" },
        { symbol: "ITC.NS", stockName: "ITC" }
      ];

  async function analyzeSingleStock(symbolConfig) {
    try {
      const payload = await httpMarketClient.getYahooChart(symbolConfig.symbol, {
        interval: "1d",
        range: "3mo"
      });

      const points = parseYahooChartSeries(payload);
      return buildStockRecord(symbolConfig, points);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Stock analysis failed for ${symbolConfig.symbol}: ${error.message}`);
      }

      throw new Error(`Stock analysis failed for ${symbolConfig.symbol} with unknown error`);
    }
  }

  async function getTopStocks(limit = 5) {
    try {
      const normalizedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 5;
      const finalLimit = Math.max(1, Math.min(10, Math.trunc(normalizedLimit)));

      const mapStockOutput = (item) => ({
        StockName: item.StockName,
        CurrentPrice: item.CurrentPrice,
        TargetPrice: item.TargetPrice,
        ExpectedDays: item.ExpectedDays,
        Trend: item.Trend,
        Volume: item.Volume,
        RSI: item.RSI,
        MACD: item.MACD,
        UpsidePercent: item.UpsidePercent,
        ConfidenceScore: item.ConfidenceScore,
        BullishSignScore: item.BullishSignScore
      });

      const settled = await Promise.allSettled(defaultSymbols.map((item) => analyzeSingleStock(item)));

      const failedSymbols = [];
      const analyzedStocks = [];

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          analyzedStocks.push(result.value);
          return;
        }

        failedSymbols.push({
          symbol: defaultSymbols[index]?.symbol || "UNKNOWN",
          error: result.reason instanceof Error ? result.reason.message : "Unknown stock error"
        });
      });

      if (analyzedStocks.length === 0) {
        return {
          success: false,
          source: "YAHOO_FINANCE_UNAVAILABLE",
          message: "Unable to fetch live stock data right now.",
          generatedAt: new Date().toISOString(),
          refreshIntervalSeconds: 86400,
          stocks: [],
          failedSymbols
        };
      }

      const sortedByBullishSigns = [...analyzedStocks].sort((a, b) => {
        if ((b.BullishSignScore || 0) !== (a.BullishSignScore || 0)) {
          return (b.BullishSignScore || 0) - (a.BullishSignScore || 0);
        }

        if (b.UpsidePercent !== a.UpsidePercent) {
          return b.UpsidePercent - a.UpsidePercent;
        }

        return b.ConfidenceScore - a.ConfidenceScore;
      });

      const strongBullishSignStocks = sortedByBullishSigns.filter(
        (item) => (item.BullishSignScore || 0) >= 2
      );
      const remainingStocks = sortedByBullishSigns.filter((item) => (item.BullishSignScore || 0) < 2);

      const prioritizedStocks = [...strongBullishSignStocks, ...remainingStocks]
        .slice(0, finalLimit)
        .map(mapStockOutput);

      const sortedStocks = prioritizedStocks
        .sort((a, b) => {
          if ((b.BullishSignScore || 0) !== (a.BullishSignScore || 0)) {
            return (b.BullishSignScore || 0) - (a.BullishSignScore || 0);
          }

          if (b.UpsidePercent !== a.UpsidePercent) {
            return b.UpsidePercent - a.UpsidePercent;
          }

          return b.ConfidenceScore - a.ConfidenceScore;
        })
        .slice(0, finalLimit)
        .map(mapStockOutput);

      return {
        success: true,
        source: "YAHOO_FINANCE",
        message: "Top 5 bullish-sign stocks identified from live market data.",
        generatedAt: new Date().toISOString(),
        refreshIntervalSeconds: 86400,
        stocks: sortedStocks,
        failedSymbols
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Top stock analysis failed: ${error.message}`);
      }

      throw new Error("Top stock analysis failed with unknown error");
    }
  }

  return {
    getTopStocks
  };
}

module.exports = {
  createStockAnalysisService
};
