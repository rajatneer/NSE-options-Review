function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildPredictionReason({
  prediction,
  pcr,
  marketBias,
  buildupSignal,
  callBuildup,
  putBuildup
}) {
  try {
    const pcrText = `PCR ${Number(pcr).toFixed(2)}`;
    const buildupText = `Call buildup ${Math.round(callBuildup).toLocaleString("en-IN")} vs Put buildup ${Math.round(putBuildup).toLocaleString("en-IN")}`;

    if (prediction === "UP") {
      return `${pcrText} is above bullish threshold and ${buildupSignal.toLowerCase()}, so bias is ${marketBias.toUpperCase()} and market is likely to move UP.`;
    }

    if (prediction === "DOWN") {
      return `${pcrText} is below bearish threshold and ${buildupSignal.toLowerCase()}, so bias is ${marketBias.toUpperCase()} and market is likely to move DOWN.`;
    }

    return `${pcrText} is in neutral range with ${buildupSignal.toLowerCase()} (${buildupText}), so market is likely SIDEWAYS.`;
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
  totals
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

    let biasScore = 0;
    if (prediction === "UP") {
      biasScore += 1;
    } else if (prediction === "DOWN") {
      biasScore -= 1;
    }

    if (buildupSignal === "Bullish pressure") {
      biasScore += 1;
    } else if (buildupSignal === "Bearish pressure") {
      biasScore -= 1;
    }

    if (flowBias === "BULLISH") {
      biasScore += 1;
    } else if (flowBias === "BEARISH") {
      biasScore -= 1;
    }

    const directionalBias = biasScore > 0 ? "UP" : biasScore < 0 ? "DOWN" : "SIDEWAYS";
    const targetPoints = directionalBias === "SIDEWAYS" ? 0 : Math.abs(biasScore) >= 2 ? 15 : 10;
    const stopLossPoints = directionalBias === "SIDEWAYS" ? 0 : targetPoints === 15 ? 10 : 7;

    const atmStrike = pickNearestStrike(strikeData, currentPrice);
    const selectedStrike =
      directionalBias === "UP"
        ? pickFlowStrike(strikeData, currentPrice, "CALL")
        : directionalBias === "DOWN"
          ? pickFlowStrike(strikeData, currentPrice, "PUT")
          : atmStrike;

    const entryLevel = roundToStep(currentPrice || selectedStrike.strikePrice, 0.05);
    const targetLevel =
      directionalBias === "UP"
        ? roundToStep(entryLevel + targetPoints, 0.05)
        : directionalBias === "DOWN"
          ? roundToStep(entryLevel - targetPoints, 0.05)
          : entryLevel;

    const stopLossLevel =
      directionalBias === "UP"
        ? roundToStep(entryLevel - stopLossPoints, 0.05)
        : directionalBias === "DOWN"
          ? roundToStep(entryLevel + stopLossPoints, 0.05)
          : entryLevel;

    const action =
      directionalBias === "UP"
        ? "BUY CALL (CE)"
        : directionalBias === "DOWN"
          ? "BUY PUT (PE)"
          : "NO TRADE";

    const optionType = directionalBias === "UP" ? "CE" : directionalBias === "DOWN" ? "PE" : "NA";

    const rationale =
      directionalBias === "UP"
        ? "Put-side buying flow is stronger than call-side selling pressure, indicating upside momentum."
        : directionalBias === "DOWN"
          ? "Call-side selling pressure is stronger than put-side buying flow, indicating downside momentum."
          : "Call and put pressure are balanced, so directional edge is weak right now.";

    return {
      action,
      optionType,
      directionalBias,
      strikePrice: selectedStrike.strikePrice,
      entryLevel,
      stopLoss: stopLossLevel,
      target: targetLevel,
      targetPoints: directionalBias === "SIDEWAYS" ? "0" : "10-15",
      flowBias,
      callPressureFlow,
      putPressureFlow,
      confidenceScore: Math.abs(biasScore),
      rationale
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

function analyzeMarket(rawData) {
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

    if (pcr > 1.2) {
      marketBias = "Bullish";
      prediction = "UP";
    } else if (pcr < 0.8) {
      marketBias = "Bearish";
      prediction = "DOWN";
    }

    const buildupSignal =
      callBuildup > putBuildup
        ? "Bearish pressure"
        : putBuildup > callBuildup
          ? "Bullish pressure"
          : "Balanced buildup";

    const predictionReason = buildPredictionReason({
      prediction,
      pcr,
      marketBias,
      buildupSignal,
      callBuildup,
      putBuildup
    });

    const tradeSetup = buildTradeSetup({
      strikeData,
      currentPrice,
      prediction,
      buildupSignal,
      totals
    });

    return {
      currentPrice,
      pcr: Number(pcr.toFixed(4)),
      support: support.strikePrice,
      resistance: resistance.strikePrice,
      callBuildup,
      putBuildup,
      prediction,
      marketBias,
      predictionReason,
      buildupSignal,
      buildupMode: isChangeOiUnavailable ? "VOLUME_PROXY" : "CHANGE_IN_OI",
      tradeSetup,
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
