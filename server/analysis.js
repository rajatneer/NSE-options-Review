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

function deriveOptionChainSignal({
  pcr,
  callBuildup,
  putBuildup,
  currentPrice,
  support,
  resistance
}) {
  try {
    const normalizedPcr = toNumber(pcr);
    const normalizedCallBuildup = toNumber(callBuildup);
    const normalizedPutBuildup = toNumber(putBuildup);
    const normalizedCurrent = toNumber(currentPrice);
    const normalizedSupport = toNumber(support);
    const normalizedResistance = toNumber(resistance);

    let pcrBias = "NEUTRAL";
    if (normalizedPcr >= 1.1) {
      pcrBias = "BULLISH";
    } else if (normalizedPcr <= 0.9) {
      pcrBias = "BEARISH";
    }

    let buildupBias = "NEUTRAL";
    if (normalizedPutBuildup > normalizedCallBuildup * 1.05) {
      buildupBias = "BULLISH";
    } else if (normalizedCallBuildup > normalizedPutBuildup * 1.05) {
      buildupBias = "BEARISH";
    }

    const distanceToSupport =
      normalizedSupport > 0 && normalizedCurrent > normalizedSupport
        ? normalizedCurrent - normalizedSupport
        : 0;

    const distanceToResistance =
      normalizedResistance > normalizedCurrent
        ? normalizedResistance - normalizedCurrent
        : 0;

    let structureBias = "NEUTRAL";
    if (distanceToSupport > 0 && distanceToResistance > 0) {
      if (distanceToResistance <= distanceToSupport * 0.8) {
        structureBias = "BEARISH";
      } else if (distanceToSupport <= distanceToResistance * 0.8) {
        structureBias = "BULLISH";
      }
    }

    const scoreMap = {
      BULLISH: 1,
      BEARISH: -1,
      NEUTRAL: 0
    };

    const score =
      scoreMap[pcrBias] +
      scoreMap[buildupBias] +
      scoreMap[structureBias];

    let bias = "NEUTRAL";
    if (score > 0) {
      bias = "BULLISH";
    } else if (score < 0) {
      bias = "BEARISH";
    }

    return {
      bias,
      score,
      pcrBias,
      buildupBias,
      structureBias,
      distanceToSupport: Number(distanceToSupport.toFixed(2)),
      distanceToResistance: Number(distanceToResistance.toFixed(2))
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Option-chain signal derivation failed: ${error.message}`);
    }

    throw new Error("Option-chain signal derivation failed with unknown error");
  }
}

function normalizeSentimentEngine(signal) {
  try {
    if (typeof signal !== "string") {
      throw new TypeError("Sentiment engine signal must be a string");
    }

    const normalized = signal.trim().toUpperCase();
    if (normalized === "BULLISH" || normalized === "BEARISH" || normalized === "NEUTRAL") {
      return normalized;
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
  const normalized = normalizeSentimentEngine(signal);

  if (normalized === "BULLISH") {
    return 1;
  }

  if (normalized === "BEARISH") {
    return -1;
  }

  return 0;
}

function buildPredictionReason({
  prediction,
  marketBias,
  pcr,
  optionChainSignal,
  buildupSignal,
  volumeBias,
  marketSentimentSignal,
  marketSentimentScore,
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
    const optionText = `PCR ${Number(pcr).toFixed(2)}, structure ${optionChainSignal?.structureBias || "NEUTRAL"}, buildup ${optionChainSignal?.buildupBias || "NEUTRAL"}`;
    const sentimentText = `Sentiment engine ${marketSentimentSignal} (score ${toNumber(marketSentimentScore)})`;

    if (prediction === "UP") {
      return `${qualityPrefix}${volumeText} combined with ${sentimentText} indicates upside, giving ${marketBias.toUpperCase()}. Context: ${optionText} with ${buildupSignal.toLowerCase()} (${buildupText}). Final view: UP.`;
    }

    if (prediction === "DOWN") {
      return `${qualityPrefix}${volumeText} combined with ${sentimentText} indicates downside, giving ${marketBias.toUpperCase()}. Context: ${optionText} with ${buildupSignal.toLowerCase()} (${buildupText}). Final view: DOWN.`;
    }

    return `${qualityPrefix}Volume bias ${volumeBias} and sentiment engine ${marketSentimentSignal} are mixed, so direction is SIDEWAYS. Context: ${optionText} with ${buildupSignal.toLowerCase()} (${buildupText}), sentiment score ${toNumber(marketSentimentScore)}.`;
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
  volumeBias,
  optionChainSignal,
  marketSentimentAnalyzer,
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

    const callPressureFlow =
      toNumber(totals.totalCallVolume) + Math.max(toNumber(totals.totalCallChangeOI), 0);
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

    const normalizedVolumeBias = normalizeSentimentEngine(volumeBias);
    const normalizedOptionChainBias = normalizeSentimentEngine(optionChainSignal?.bias);
    const normalizedPcrBias = normalizeSentimentEngine(optionChainSignal?.pcrBias);
    const normalizedMarketSentiment = normalizeSentimentEngine(
      marketSentimentAnalyzer?.marketSentiment
    );
    const marketSentimentScore = toNumber(marketSentimentAnalyzer?.totalScore);

    const sentimentEngineSignals = marketSentimentAnalyzer?.signals || {};
    const sentimentEngineDetails = marketSentimentAnalyzer?.details || {};

    const sentimentGlobalSignal = normalizeSentimentEngine(sentimentEngineSignals?.globalMarket);
    const sentimentOptionChainSignal = normalizeSentimentEngine(sentimentEngineSignals?.optionChain);
    const sentimentPcrSignal = normalizeSentimentEngine(sentimentEngineSignals?.pcr);

    const fiiDiiSignal = normalizeSentimentEngine(sentimentEngineDetails?.fiiDii?.signal);
    const technicalSignal = normalizeSentimentEngine(
      sentimentEngineDetails?.technicalIndicators?.signal
    );
    const rsiEmaSignal = normalizeSentimentEngine(
      sentimentEngineDetails?.rsiEmaSignal?.signal
    );
    const newsSignal = normalizeSentimentEngine(sentimentEngineDetails?.newsSentiment?.signal);
    const giftNiftySignal = normalizeSentimentEngine(sentimentEngineDetails?.giftNifty?.signal);

    let supportResistanceSignal = "NEUTRAL";
    if (upsideRoom >= 15 && upsideRoom > downsideRoom * 1.15) {
      supportResistanceSignal = "BULLISH";
    } else if (downsideRoom >= 15 && downsideRoom > upsideRoom * 1.15) {
      supportResistanceSignal = "BEARISH";
    }

    const predictionSignal =
      prediction === "UP" ? "BULLISH" : prediction === "DOWN" ? "BEARISH" : "NEUTRAL";
    const buildupPressureSignal =
      buildupSignal === "Bullish pressure"
        ? "BULLISH"
        : buildupSignal === "Bearish pressure"
          ? "BEARISH"
          : "NEUTRAL";

    const weightedComponents = [
      { name: "prediction", signal: predictionSignal, weight: 1.5 },
      { name: "volumeBias", signal: normalizedVolumeBias, weight: 2 },
      { name: "marketSentiment", signal: normalizedMarketSentiment, weight: 2 },
      { name: "optionChain", signal: normalizedOptionChainBias, weight: 1 },
      { name: "pcr", signal: normalizedPcrBias, weight: 1 },
      { name: "sentimentGlobal", signal: sentimentGlobalSignal, weight: 0.75 },
      { name: "sentimentOptionChain", signal: sentimentOptionChainSignal, weight: 0.75 },
      { name: "sentimentPcr", signal: sentimentPcrSignal, weight: 0.75 },
      { name: "buildup", signal: buildupPressureSignal, weight: 1 },
      { name: "flow", signal: flowBias, weight: 1 },
      { name: "marketStructure", signal: marketStructureSignal, weight: 1 },
      { name: "global", signal: normalizedGlobalBias, weight: 1 },
      { name: "supportResistance", signal: supportResistanceSignal, weight: 1 },
      { name: "fiiDii", signal: fiiDiiSignal, weight: 1 },
      { name: "technical", signal: technicalSignal, weight: 1 },
      { name: "rsiEma", signal: rsiEmaSignal, weight: 1 },
      { name: "news", signal: newsSignal, weight: 1 },
      { name: "giftNifty", signal: giftNiftySignal, weight: 0.5 }
    ];

    const weightedScore = weightedComponents.reduce(
      (sum, item) => sum + signalToScore(item.signal) * item.weight,
      0
    );

    const totalWeight = weightedComponents.reduce((sum, item) => sum + item.weight, 0);
    const bullishWeight = weightedComponents.reduce(
      (sum, item) => sum + (item.signal === "BULLISH" ? item.weight : 0),
      0
    );
    const bearishWeight = weightedComponents.reduce(
      (sum, item) => sum + (item.signal === "BEARISH" ? item.weight : 0),
      0
    );
    const directionalEdge = bullishWeight - bearishWeight;
    const confluenceRatio =
      totalWeight > 0 ? Number((Math.max(bullishWeight, bearishWeight) / totalWeight).toFixed(3)) : 0;

    const allSignalsForVotes = weightedComponents.map((item) => item.signal);
    const bullishVotes = allSignalsForVotes.filter((signal) => signal === "BULLISH").length;
    const bearishVotes = allSignalsForVotes.filter((signal) => signal === "BEARISH").length;

    let directionalBias = "SIDEWAYS";
    if (directionalEdge >= 2.5 && confluenceRatio >= 0.56) {
      directionalBias = "UP";
    } else if (directionalEdge <= -2.5 && confluenceRatio >= 0.56) {
      directionalBias = "DOWN";
    }

    const coreNames = [
      "prediction",
      "volumeBias",
      "marketSentiment",
      "optionChain",
      "pcr",
      "flow",
      "marketStructure",
      "supportResistance"
    ];
    const coreComponents = weightedComponents.filter((item) => coreNames.includes(item.name));
    const requiredCoreSignal = directionalBias === "UP" ? "BULLISH" : "BEARISH";
    const coreAlignmentCount =
      directionalBias === "SIDEWAYS"
        ? 0
        : coreComponents.filter((item) => item.signal === requiredCoreSignal).length;

    if (directionalBias !== "SIDEWAYS" && coreAlignmentCount < 4) {
      directionalBias = "SIDEWAYS";
    }

    if (!dataQuality?.isReliable && directionalBias !== "SIDEWAYS") {
      const lowQualityPasses = confluenceRatio >= 0.6 && Math.abs(directionalEdge) >= 3.5;
      if (!lowQualityPasses) {
        directionalBias = "SIDEWAYS";
      }
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

    const desiredMovePoints = Math.max(10, Math.min(15, Math.round(confluenceRatio * 20)));
    const stopBufferPoints = Math.max(6, Math.min(8, desiredMovePoints - 4));

    if (directionalBias === "UP") {
      const rawTarget = Math.min(
        entryLevel + desiredMovePoints,
        (nearestResistance || entryLevel + desiredMovePoints) - 1
      );
      const potentialMove = rawTarget - entryLevel;

      if (potentialMove >= 10) {
        targetLevel = roundToStep(rawTarget, 0.05);
        stopLossLevel = roundToStep(
          Math.max(entryLevel - stopBufferPoints, (nearestSupport || entryLevel - stopBufferPoints) - 2),
          0.05
        );
        targetPoints = "10-15";
        riskTag = dataQuality?.isReliable ? "SAFE" : "CAUTIOUS";
        action = "SPOT BUY (NIFTY)";
        optionType = "CE";
        confirmationInstrument = "CALL (CE) flow confirmation";
      }
    } else if (directionalBias === "DOWN") {
      const rawTarget = Math.max(
        entryLevel - desiredMovePoints,
        (nearestSupport || entryLevel - desiredMovePoints) + 1
      );
      const potentialMove = entryLevel - rawTarget;

      if (potentialMove >= 10) {
        targetLevel = roundToStep(rawTarget, 0.05);
        stopLossLevel = roundToStep(
          Math.min(entryLevel + stopBufferPoints, (nearestResistance || entryLevel + stopBufferPoints) + 2),
          0.05
        );
        targetPoints = "10-15";
        riskTag = dataQuality?.isReliable ? "SAFE" : "CAUTIOUS";
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

    const volumeFlowDetail =
      `Volume bias ${normalizedVolumeBias}, Call flow ${Math.round(callPressureFlow).toLocaleString("en-IN")}, Put flow ${Math.round(putPressureFlow).toLocaleString("en-IN")}.`;

    const sentimentSignals = Object.values(sentimentEngineSignals).map((signal) =>
      normalizeSentimentEngine(signal)
    );
    const sentimentBullishVotes = sentimentSignals.filter((signal) => signal === "BULLISH").length;
    const sentimentBearishVotes = sentimentSignals.filter((signal) => signal === "BEARISH").length;
    const sentimentNeutralVotes = sentimentSignals.filter((signal) => signal === "NEUTRAL").length;

    const sentimentEngineDetail =
      `Overall ${normalizedMarketSentiment} (score ${marketSentimentScore}), Bullish ${sentimentBullishVotes}, Bearish ${sentimentBearishVotes}, Neutral ${sentimentNeutralVotes}.`;

    const optionChainDetail =
      `Option chain ${normalizedOptionChainBias}, structure ${optionChainSignal?.structureBias || "NEUTRAL"}, buildup ${optionChainSignal?.buildupBias || "NEUTRAL"}.`;

    const pcrDetail =
      `PCR signal ${normalizedPcrBias} based on option-chain structure inputs.`;

    const fiiDetail =
      `FII net ${Math.round(toNumber(sentimentEngineDetails?.fiiDii?.fiiNetValue)).toLocaleString("en-IN")}, signal ${fiiDiiSignal}.`;

    const technicalDetail =
      `Technicals ${technicalSignal} with RSI ${toNumber(sentimentEngineDetails?.technicalIndicators?.rsi).toFixed(2)} and MA50 ${toNumber(sentimentEngineDetails?.technicalIndicators?.ma50).toFixed(2)}.`;

    const rsiEmaDetail =
      `RSI+EMA ${rsiEmaSignal}, EMA9 ${toNumber(sentimentEngineDetails?.rsiEmaSignal?.ema9).toFixed(2)}, EMA21 ${toNumber(sentimentEngineDetails?.rsiEmaSignal?.ema21).toFixed(2)}, RSI14 ${toNumber(sentimentEngineDetails?.rsiEmaSignal?.rsi14).toFixed(2)}.`;

    const newsDetail =
      `News score ${toNumber(sentimentEngineDetails?.newsSentiment?.newsScore)}, bullish hits ${toNumber(sentimentEngineDetails?.newsSentiment?.bullishHits)}, bearish hits ${toNumber(sentimentEngineDetails?.newsSentiment?.bearishHits)}.`;

    const giftNiftyDetail =
      `Gift Nifty ${giftNiftySignal}, move ${toNumber(sentimentEngineDetails?.giftNifty?.pointDifference).toFixed(2)} points.`;

    const confluenceDetail =
      `Confluence ${Math.round(confluenceRatio * 100)}%, weighted bull ${bullishWeight.toFixed(2)}, weighted bear ${bearishWeight.toFixed(2)}, core alignment ${coreAlignmentCount}/${coreComponents.length}.`;

    const rationale =
      action === "SPOT BUY (NIFTY)"
        ? `${dataQuality?.isReliable ? "Safe" : "Cautious"} spot BUY setup: all fetched logic blocks align for upside with valid room and risk limits.${
            dataQuality?.isReliable ? "" : " Data quality is reduced, so position sizing should be lighter."
          } ${confluenceDetail}`
        : action === "SPOT SELL (NIFTY)"
          ? `${dataQuality?.isReliable ? "Safe" : "Cautious"} spot SELL setup: all fetched logic blocks align for downside with valid room and risk limits.${
              dataQuality?.isReliable ? "" : " Data quality is reduced, so position sizing should be lighter."
            } ${confluenceDetail}`
          : !dataQuality?.isReliable
            ? `No safe trade: fallback data depth is incomplete, so setup confidence is intentionally reduced. ${confluenceDetail}`
            : `No safe trade: all-signal confluence and room-to-target did not meet the 10-15 point safety criteria. ${confluenceDetail}`;

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
      confidenceScore: Number(Math.abs(weightedScore).toFixed(2)),
      weightedDecisionScore: Number(weightedScore.toFixed(2)),
      weightedDecisionThreshold: 3,
      confluenceRatio,
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
        },
        volumeFlow: {
          signal: normalizedVolumeBias,
          detail: volumeFlowDetail
        },
        sentimentEngine: {
          signal: normalizedMarketSentiment,
          score: marketSentimentScore,
          detail: sentimentEngineDetail
        },
        optionChain: {
          signal: normalizedOptionChainBias,
          detail: optionChainDetail
        },
        pcr: {
          signal: normalizedPcrBias,
          detail: pcrDetail
        },
        fiiDii: {
          signal: fiiDiiSignal,
          detail: fiiDetail
        },
        technicalIndicators: {
          signal: technicalSignal,
          detail: technicalDetail
        },
        rsiEmaSignal: {
          signal: rsiEmaSignal,
          detail: rsiEmaDetail
        },
        newsSentiment: {
          signal: newsSignal,
          detail: newsDetail
        },
        giftNifty: {
          signal: giftNiftySignal,
          detail: giftNiftyDetail
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
    const marketSentimentSignal = normalizeSentimentEngine(
      context?.marketSentimentAnalyzer?.marketSentiment
    );
    const marketSentimentScore = toNumber(context?.marketSentimentAnalyzer?.totalScore);

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

    const optionChainSignal = deriveOptionChainSignal({
      pcr,
      callBuildup,
      putBuildup,
      currentPrice,
      support: support.strikePrice,
      resistance: resistance.strikePrice
    });

    let marketBias = "Sideways";
    let prediction = "SIDEWAYS";

    const scoreMap = {
      BULLISH: 1,
      BEARISH: -1,
      NEUTRAL: 0
    };

    const blendedDirectionalScore = scoreMap[volumeBias] + scoreMap[marketSentimentSignal];

    if (blendedDirectionalScore > 0) {
      marketBias = "Bullish";
      prediction = "UP";
    } else if (blendedDirectionalScore < 0) {
      marketBias = "Bearish";
      prediction = "DOWN";
    }

    let predictionConfidence = "MEDIUM";
    if (!dataQuality.isReliable) {
      predictionConfidence = "LOW";
    } else if (
      volumeBias !== "NEUTRAL" &&
      marketSentimentSignal !== "NEUTRAL" &&
      volumeBias === marketSentimentSignal
    ) {
      predictionConfidence = "HIGH";
    } else if (volumeBias !== "NEUTRAL" || marketSentimentSignal !== "NEUTRAL") {
      predictionConfidence = "MEDIUM";
    } else {
      predictionConfidence = "LOW";
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
      pcr,
      optionChainSignal,
      volumeBias,
      marketSentimentSignal,
      marketSentimentScore,
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
      volumeBias,
      optionChainSignal,
      marketSentimentAnalyzer: context?.marketSentimentAnalyzer,
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
      predictionBasis: "VOLUME_FLOW + MARKET_SENTIMENT_ANALYZER",
      predictionReason,
      buildupSignal,
      buildupMode: isChangeOiUnavailable ? "VOLUME_PROXY" : "CHANGE_IN_OI",
      tradeSetup,
      optionChainSignal,
      marketSentimentAnalyzer: {
        marketSentiment: marketSentimentSignal,
        totalScore: marketSentimentScore
      },
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
