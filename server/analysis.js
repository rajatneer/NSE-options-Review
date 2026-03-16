function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function assessDataQuality(strikeData, source = "UNKNOWN") {
  try {
    if (!Array.isArray(strikeData) || strikeData.length === 0) {
      throw new TypeError("Strike data is required for quality assessment");
    }

    const sorted = [...strikeData].sort((a, b) => a.strikePrice - b.strikePrice);
    const strikeCount = sorted.length;
    const twoSidedCount = sorted.filter((item) => item.callOI > 0 && item.putOI > 0).length;
    const twoSidedRatio = strikeCount === 0 ? 0 : twoSidedCount / strikeCount;
    const strikeRange =
      strikeCount > 1 ? Math.max(sorted[strikeCount - 1].strikePrice - sorted[0].strikePrice, 0) : 0;

    const isPrimarySource = source === "NSE_OPTION_CHAIN" || source === "NSE_OPTION_CHAIN_CACHE";
    const isReliable = isPrimarySource || (strikeCount >= 30 && twoSidedRatio >= 0.35 && strikeRange >= 1200);

    return {
      source,
      strikeCount,
      twoSidedCount,
      twoSidedRatio: Number(twoSidedRatio.toFixed(3)),
      strikeRange,
      isReliable,
      level: isReliable ? "HIGH" : "LOW",
      warning: isReliable
        ? "Data depth is sufficient for directional analysis."
        : "Option chain depth is partial; PCR/support/resistance may be biased."
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Data quality assessment failed: ${error.message}`);
    }

    throw new Error("Data quality assessment failed with unknown error");
  }
}

function deriveChartSignal(chartDetails = {}) {
  try {
    const recommendationValue = toNumber(chartDetails.recommendationValue);
    const rsi = toNumber(chartDetails.rsi);
    const macdValue = toNumber(chartDetails.macdValue);
    const macdSignal = toNumber(chartDetails.macdSignal);
    const close = toNumber(chartDetails.close);
    const ema20 = toNumber(chartDetails.ema20);
    const ema50 = toNumber(chartDetails.ema50);
    const ema200 = toNumber(chartDetails.ema200);

    let score = 0;

    if (recommendationValue >= 0.2) {
      score += 2;
    } else if (recommendationValue <= -0.2) {
      score -= 2;
    }

    if (rsi >= 60) {
      score += 1;
    } else if (rsi <= 40) {
      score -= 1;
    }

    if (macdValue > macdSignal) {
      score += 1;
    } else if (macdValue < macdSignal) {
      score -= 1;
    }

    if (close > ema20 && ema20 > ema50 && ema50 > ema200) {
      score += 1;
    } else if (close < ema20 && ema20 < ema50 && ema50 < ema200) {
      score -= 1;
    }

    let bias = "NEUTRAL";
    if (score >= 2) {
      bias = "BULLISH";
    } else if (score <= -2) {
      bias = "BEARISH";
    }

    return {
      bias,
      score,
      recommendationValue,
      recommendationLabel: chartDetails.recommendationLabel || "NEUTRAL"
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Chart signal derivation failed: ${error.message}`);
    }

    throw new Error("Chart signal derivation failed with unknown error");
  }
}

function buildPredictionReason({
  prediction,
  marketBias,
  buildupSignal,
  volumeBias,
  chartSignal,
  volumeRatio,
  totalCallVolume,
  totalPutVolume,
  callBuildup,
  putBuildup,
  dataQuality
}) {
  try {
    const qualityPrefix =
      dataQuality && !dataQuality.isReliable
        ? "Data depth is partial, so confidence is low. "
        : "";

    const volumeText = `Put volume ${Math.round(totalPutVolume).toLocaleString("en-IN")} vs Call volume ${Math.round(totalCallVolume).toLocaleString("en-IN")} (PVCR ${Number(volumeRatio).toFixed(2)})`;
    const buildupText = `Call buildup ${Math.round(callBuildup).toLocaleString("en-IN")} vs Put buildup ${Math.round(putBuildup).toLocaleString("en-IN")}`;

    const chartText = `Chart bias ${chartSignal?.bias || "NEUTRAL"} (TV ${chartSignal?.recommendationLabel || "NEUTRAL"}, score ${toNumber(chartSignal?.score)})`;

    if (prediction === "UP") {
      return `${qualityPrefix}${volumeText} with ${chartText} and ${buildupSignal.toLowerCase()} (${buildupText}) supports upside bias ${marketBias.toUpperCase()}, so market is likely to move UP.`;
    }

    if (prediction === "DOWN") {
      return `${qualityPrefix}${volumeText} with ${chartText} and ${buildupSignal.toLowerCase()} (${buildupText}) supports downside bias ${marketBias.toUpperCase()}, so market is likely to move DOWN.`;
    }

    return `${qualityPrefix}${volumeText} and ${chartText} are mixed (volume bias ${volumeBias}), with ${buildupSignal.toLowerCase()} (${buildupText}), so market is likely SIDEWAYS.`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Prediction reason generation failed: ${error.message}`);
    }

    throw new Error("Prediction reason generation failed with unknown error");
  }
}

function roundToStep(value, step = 0.05) {
  try {
    const numericValue = toNumber(value);
    if (step <= 0) {
      throw new RangeError("Round step must be greater than zero");
    }

    return Number((Math.round(numericValue / step) * step).toFixed(2));
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Rounding failed: ${error.message}`);
    }

    throw new Error("Rounding failed with unknown error");
  }
}

function pickNearestStrike(strikeData, currentPrice) {
  try {
    if (!Array.isArray(strikeData) || strikeData.length === 0) {
      throw new TypeError("Strike data is required to pick nearest strike");
    }

    return strikeData.reduce((prev, current) => {
      const prevDiff = Math.abs(prev.strikePrice - currentPrice);
      const currentDiff = Math.abs(current.strikePrice - currentPrice);
      return currentDiff < prevDiff ? current : prev;
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Nearest strike selection failed: ${error.message}`);
    }

    throw new Error("Nearest strike selection failed with unknown error");
  }
}

function pickFlowStrike(strikeData, currentPrice, side) {
  try {
    if (!Array.isArray(strikeData) || strikeData.length === 0) {
      throw new TypeError("Strike data is required to pick flow strike");
    }

    if (side !== "CALL" && side !== "PUT") {
      throw new RangeError(`Unsupported side for flow strike selection: ${side}`);
    }

    const sideVolumeKey = side === "CALL" ? "callVolume" : "putVolume";
    const sideOiKey = side === "CALL" ? "callOI" : "putOI";

    const withinWindow = strikeData.filter(
      (item) => Math.abs(item.strikePrice - currentPrice) <= 400 && item[sideVolumeKey] > 0
    );

    const globalCandidates = strikeData.filter((item) => item[sideVolumeKey] > 0);
    const candidates = withinWindow.length > 0 ? withinWindow : globalCandidates;

    if (candidates.length === 0) {
      return pickNearestStrike(strikeData, currentPrice);
    }

    return candidates.reduce((prev, current) => {
      const prevScore = prev[sideVolumeKey] * 0.7 + prev[sideOiKey] * 0.3;
      const currentScore = current[sideVolumeKey] * 0.7 + current[sideOiKey] * 0.3;

      if (currentScore !== prevScore) {
        return currentScore > prevScore ? current : prev;
      }

      const prevDiff = Math.abs(prev.strikePrice - currentPrice);
      const currentDiff = Math.abs(current.strikePrice - currentPrice);
      return currentDiff < prevDiff ? current : prev;
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Flow strike selection failed: ${error.message}`);
    }

    throw new Error("Flow strike selection failed with unknown error");
  }
}

function buildTradeSetup({
  strikeData,
  currentPrice,
  prediction,
  buildupSignal,
  totals,
  support,
  resistance,
  globalSentiment,
  dataQuality
}) {
  try {
    if (!Array.isArray(strikeData) || strikeData.length === 0) {
      throw new TypeError("Strike data is required to build trade setup");
    }

    const callPressureFlow = toNumber(totals.totalCallVolume) + Math.max(toNumber(totals.totalCallChangeOI), 0);
    const putPressureFlow = toNumber(totals.totalPutVolume) + Math.max(toNumber(totals.totalPutChangeOI), 0);

    let flowBias = "NEUTRAL";
    if (putPressureFlow > callPressureFlow * 1.08) {
      flowBias = "BULLISH";
    } else if (callPressureFlow > putPressureFlow * 1.08) {
      flowBias = "BEARISH";
    }

    const nearestSupportRow = [...strikeData]
      .filter((item) => item.strikePrice <= currentPrice && item.putOI > 0)
      .sort((a, b) => b.strikePrice - a.strikePrice)[0];

    const nearestResistanceRow = [...strikeData]
      .filter((item) => item.strikePrice >= currentPrice && item.callOI > 0)
      .sort((a, b) => a.strikePrice - b.strikePrice)[0];

    const nearestSupport = nearestSupportRow?.strikePrice || support;
    const nearestResistance = nearestResistanceRow?.strikePrice || resistance;

    const upsideRoom =
      Number.isFinite(nearestResistance) && nearestResistance > currentPrice
        ? nearestResistance - currentPrice
        : 0;

    const downsideRoom =
      Number.isFinite(nearestSupport) && nearestSupport < currentPrice
        ? currentPrice - nearestSupport
        : 0;

    const distanceToSupport = downsideRoom;
    const distanceToResistance = upsideRoom;

    let marketStructureSignal = "NEUTRAL";
    if (distanceToSupport > 0 && distanceToResistance > 0) {
      if (distanceToSupport <= distanceToResistance * 0.8) {
        marketStructureSignal = "BULLISH";
      } else if (distanceToResistance <= distanceToSupport * 0.8) {
        marketStructureSignal = "BEARISH";
      }
    }

    const normalizedGlobalBias = ["BULLISH", "BEARISH"].includes(globalSentiment?.bias)
      ? globalSentiment.bias
      : "NEUTRAL";

    let supportResistanceSignal = "NEUTRAL";
    if (upsideRoom >= 15 && upsideRoom > downsideRoom * 1.15) {
      supportResistanceSignal = "BULLISH";
    } else if (downsideRoom >= 15 && downsideRoom > upsideRoom * 1.15) {
      supportResistanceSignal = "BEARISH";
    }

    const signalSet = [
      prediction === "UP" ? "BULLISH" : prediction === "DOWN" ? "BEARISH" : "NEUTRAL",
      buildupSignal === "Bullish pressure"
        ? "BULLISH"
        : buildupSignal === "Bearish pressure"
          ? "BEARISH"
          : "NEUTRAL",
      flowBias,
      marketStructureSignal,
      normalizedGlobalBias,
      supportResistanceSignal
    ];

    const bullishVotes = signalSet.filter((signal) => signal === "BULLISH").length;
    const bearishVotes = signalSet.filter((signal) => signal === "BEARISH").length;

    let directionalBias = "SIDEWAYS";
    if (bullishVotes >= 3 && bullishVotes > bearishVotes) {
      directionalBias = "UP";
    } else if (bearishVotes >= 3 && bearishVotes > bullishVotes) {
      directionalBias = "DOWN";
    }

    if (!dataQuality?.isReliable) {
      directionalBias = "SIDEWAYS";
    }

    const atmStrike = pickNearestStrike(strikeData, currentPrice);
    const selectedStrike =
      directionalBias === "UP"
        ? pickFlowStrike(strikeData, currentPrice, "CALL")
        : directionalBias === "DOWN"
          ? pickFlowStrike(strikeData, currentPrice, "PUT")
          : atmStrike;

    const entryLevel = roundToStep(currentPrice || selectedStrike.strikePrice, 0.05);

    let action = "NO TRADE";
    let optionType = "NA";
    let targetLevel = entryLevel;
    let stopLossLevel = entryLevel;
    let targetPoints = "WAIT";
    let riskTag = "WAIT";
    let confirmationInstrument = "NA";

    if (directionalBias === "UP") {
      const rawTarget = Math.min(entryLevel + 15, (nearestResistance || entryLevel + 15) - 1);
      const potentialMove = rawTarget - entryLevel;

      if (potentialMove >= 10) {
        targetLevel = roundToStep(rawTarget, 0.05);
        stopLossLevel = roundToStep(Math.max(entryLevel - 8, (nearestSupport || entryLevel - 8) - 2), 0.05);
        targetPoints = "10-15";
        riskTag = "SAFE";
        action = "SPOT BUY (NIFTY)";
        optionType = "CE";
        confirmationInstrument = "CALL (CE) flow confirmation";
      }
    } else if (directionalBias === "DOWN") {
      const rawTarget = Math.max(entryLevel - 15, (nearestSupport || entryLevel - 15) + 1);
      const potentialMove = entryLevel - rawTarget;

      if (potentialMove >= 10) {
        targetLevel = roundToStep(rawTarget, 0.05);
        stopLossLevel = roundToStep(Math.min(entryLevel + 8, (nearestResistance || entryLevel + 8) + 2), 0.05);
        targetPoints = "10-15";
        riskTag = "SAFE";
        action = "SPOT SELL (NIFTY)";
        optionType = "PE";
        confirmationInstrument = "PUT (PE) flow confirmation";
      }
    }

    const marketStructureDetail =
      marketStructureSignal === "BULLISH"
        ? `Price is closer to support (${nearestSupport}) than resistance (${nearestResistance}), structure favors upside.`
        : marketStructureSignal === "BEARISH"
          ? `Price is closer to resistance (${nearestResistance}) than support (${nearestSupport}), structure favors downside.`
          : `Price is between support (${nearestSupport}) and resistance (${nearestResistance}) without directional structure edge.`;

    const globalSentimentDetail =
      normalizedGlobalBias === "BULLISH"
        ? `Global indices are positive on average (${Number(globalSentiment?.averageChange || 0).toFixed(2)}%), supporting risk-on bias.`
        : normalizedGlobalBias === "BEARISH"
          ? `Global indices are negative on average (${Number(globalSentiment?.averageChange || 0).toFixed(2)}%), supporting risk-off bias.`
          : `Global indices are mixed (${Number(globalSentiment?.averageChange || 0).toFixed(2)}%), giving neutral sentiment.`;

    const supportResistanceDetail =
      `Support ${nearestSupport}, Resistance ${nearestResistance}, Upside room ${upsideRoom.toFixed(2)}, Downside room ${downsideRoom.toFixed(2)}.`;

    const rationale =
      action === "SPOT BUY (NIFTY)"
        ? "Safe spot BUY setup: market structure, global sentiment, and support/resistance room align on the upside."
        : action === "SPOT SELL (NIFTY)"
          ? "Safe spot SELL setup: market structure, global sentiment, and support/resistance room align on the downside."
          : !dataQuality?.isReliable
            ? "No safe trade: fallback data depth is incomplete, so setup confidence is intentionally reduced."
            : "No safe trade: core factors are not aligned or room-to-target is below the 10-point safety threshold.";

    return {
      action,
      optionType,
      directionalBias,
      strikePrice: selectedStrike.strikePrice,
      entryLevel,
      stopLoss: stopLossLevel,
      target: targetLevel,
      targetPoints,
      riskTag,
      executionBasis: "SPOT_NIFTY_LEVELS",
      confirmationInstrument,
      flowBias,
      callPressureFlow,
      putPressureFlow,
      confidenceScore: Math.abs(bullishVotes - bearishVotes),
      rationale,
      factors: {
        marketStructure: {
          signal: marketStructureSignal,
          detail: marketStructureDetail
        },
        globalSentiment: {
          signal: normalizedGlobalBias,
          detail: globalSentimentDetail,
          source: globalSentiment?.source || "UNAVAILABLE"
        },
        supportResistance: {
          signal: supportResistanceSignal,
          support: nearestSupport,
          resistance: nearestResistance,
          upsideRoom: Number(upsideRoom.toFixed(2)),
          downsideRoom: Number(downsideRoom.toFixed(2)),
          detail: supportResistanceDetail
        }
      }
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Trade setup generation failed: ${error.message}`);
    }

    throw new Error("Trade setup generation failed with unknown error");
  }
}

function analyzeMarket(rawData, context = {}) {
  try {
    if (!rawData || typeof rawData !== "object") {
      throw new TypeError("Invalid NSE payload format: payload is missing");
    }

    const rows =
      Array.isArray(rawData.records?.data) && rawData.records.data.length > 0
        ? rawData.records.data
        : Array.isArray(rawData.filtered?.data)
          ? rawData.filtered.data
          : [];

    const currentPrice =
      toNumber(rawData.records?.underlyingValue) || toNumber(rawData.filtered?.underlyingValue);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError("Invalid NSE payload format: no strike rows found");
    }

    const strikeData = rows
      .map((row) => {
        const call = row.CE || {};
        const put = row.PE || {};

        return {
          strikePrice: toNumber(row.strikePrice),
          callOI: toNumber(call.openInterest),
          putOI: toNumber(put.openInterest),
          callChangeOI: toNumber(call.changeinOpenInterest),
          putChangeOI: toNumber(put.changeinOpenInterest),
          callVolume: toNumber(call.totalTradedVolume),
          putVolume: toNumber(put.totalTradedVolume)
        };
      })
      .filter((item) => item.strikePrice > 0)
      .sort((a, b) => a.strikePrice - b.strikePrice);

    if (strikeData.length === 0) {
      throw new RangeError("No option chain strikes available for analysis");
    }

    const dataQuality = assessDataQuality(strikeData, context?.dataSource || "UNKNOWN");

    const totals = strikeData.reduce(
      (acc, item) => {
        acc.totalCallOI += item.callOI;
        acc.totalPutOI += item.putOI;
        acc.totalCallChangeOI += item.callChangeOI;
        acc.totalPutChangeOI += item.putChangeOI;
        acc.totalCallVolume += item.callVolume;
        acc.totalPutVolume += item.putVolume;
        return acc;
      },
      {
        totalCallOI: 0,
        totalPutOI: 0,
        totalCallChangeOI: 0,
        totalPutChangeOI: 0,
        totalCallVolume: 0,
        totalPutVolume: 0
      }
    );

    const pcr = totals.totalCallOI === 0 ? 0 : totals.totalPutOI / totals.totalCallOI;
    const volumeRatio =
      totals.totalCallVolume === 0 ? 0 : totals.totalPutVolume / totals.totalCallVolume;
    const volumeBias = volumeRatio > 1.15 ? "BULLISH" : volumeRatio < 0.85 ? "BEARISH" : "NEUTRAL";
    const chartSignal = deriveChartSignal(context?.chartDetails || {});

    const resistance = strikeData.reduce((prev, current) =>
      current.callOI > prev.callOI ? current : prev
    );

    const support = strikeData.reduce((prev, current) =>
      current.putOI > prev.putOI ? current : prev
    );

    const callBuildupFromChange = strikeData.reduce(
      (sum, item) => sum + (item.callChangeOI > 0 ? item.callChangeOI : 0),
      0
    );

    const putBuildupFromChange = strikeData.reduce(
      (sum, item) => sum + (item.putChangeOI > 0 ? item.putChangeOI : 0),
      0
    );

    const callBuildupFromVolume = strikeData.reduce(
      (sum, item) => sum + (item.callVolume > 0 ? item.callVolume : 0),
      0
    );

    const putBuildupFromVolume = strikeData.reduce(
      (sum, item) => sum + (item.putVolume > 0 ? item.putVolume : 0),
      0
    );

    const isChangeOiUnavailable = callBuildupFromChange === 0 && putBuildupFromChange === 0;
    const callBuildup = isChangeOiUnavailable ? callBuildupFromVolume : callBuildupFromChange;
    const putBuildup = isChangeOiUnavailable ? putBuildupFromVolume : putBuildupFromChange;

    let marketBias = "Sideways";
    let prediction = "SIDEWAYS";

    let combinedBias = "NEUTRAL";
    if (volumeBias === chartSignal.bias && volumeBias !== "NEUTRAL") {
      combinedBias = volumeBias;
    } else if (volumeBias !== "NEUTRAL" && chartSignal.bias === "NEUTRAL") {
      combinedBias = volumeBias;
    } else if (chartSignal.bias !== "NEUTRAL" && volumeBias === "NEUTRAL") {
      combinedBias = chartSignal.bias;
    }

    if (combinedBias === "BULLISH") {
      marketBias = "Bullish";
      prediction = "UP";
    } else if (combinedBias === "BEARISH") {
      marketBias = "Bearish";
      prediction = "DOWN";
    }

    let predictionConfidence = "MEDIUM";
    if (!dataQuality.isReliable) {
      predictionConfidence = "LOW";
    } else if (combinedBias !== "NEUTRAL" && volumeBias === chartSignal.bias) {
      predictionConfidence = "HIGH";
    }

    if (!dataQuality.isReliable) {
      marketBias = `${marketBias} (Low confidence)`;
    }

    const buildupSignal =
      callBuildup > putBuildup
        ? "Bearish pressure"
        : putBuildup > callBuildup
          ? "Bullish pressure"
          : "Balanced buildup";

    const predictionReason = buildPredictionReason({
      prediction,
      marketBias,
      volumeBias,
      chartSignal,
      buildupSignal,
      volumeRatio,
      totalCallVolume: totals.totalCallVolume,
      totalPutVolume: totals.totalPutVolume,
      callBuildup,
      putBuildup,
      dataQuality
    });

    const normalizedGlobalSentiment = {
      bias: ["BULLISH", "BEARISH"].includes(context?.globalSentiment?.bias)
        ? context.globalSentiment.bias
        : "NEUTRAL",
      averageChange: toNumber(context?.globalSentiment?.averageChange),
      source: context?.globalSentiment?.source || "UNAVAILABLE"
    };

    const tradeSetup = buildTradeSetup({
      strikeData,
      currentPrice,
      prediction,
      buildupSignal,
      totals,
      support: support.strikePrice,
      resistance: resistance.strikePrice,
      globalSentiment: normalizedGlobalSentiment,
      dataQuality
    });

    return {
      currentPrice,
      pcr: Number(pcr.toFixed(4)),
      volumeRatio: Number(volumeRatio.toFixed(4)),
      support: support.strikePrice,
      resistance: resistance.strikePrice,
      callBuildup,
      putBuildup,
      prediction,
      marketBias,
      predictionConfidence,
      predictionBasis: "VOLUME_FLOW + CHART_SIGNAL",
      predictionReason,
      buildupSignal,
      buildupMode: isChangeOiUnavailable ? "VOLUME_PROXY" : "CHANGE_IN_OI",
      tradeSetup,
      chartSignal,
      chartDetails: context?.chartDetails || null,
      globalSentiment: normalizedGlobalSentiment,
      dataQuality,
      totals,
      strikes: strikeData,
      analyzedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Market analysis failed: ${error.message}`);
    }

    throw new Error("Market analysis failed with unknown error");
  }
}

module.exports = {
  analyzeMarket
};
