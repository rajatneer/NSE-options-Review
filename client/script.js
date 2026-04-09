const runBtn = document.getElementById("runBtn");
const runBtnDefaultText = runBtn ? runBtn.textContent.trim() : "Run Market Analysis";
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("errorBox");
const lastUpdated = document.getElementById("lastUpdated");

const priceEl = document.getElementById("price");
const pcrEl = document.getElementById("pcr");
const supportEl = document.getElementById("support");
const resistanceEl = document.getElementById("resistance");
const callBuildupEl = document.getElementById("callBuildup");
const putBuildupEl = document.getElementById("putBuildup");
const predictionEl = document.getElementById("prediction");
const marketBiasEl = document.getElementById("marketBias");
const predictionReasonEl = document.getElementById("predictionReason");
const buildupSignalEl = document.getElementById("buildupSignal");
const sourceInfoEl = document.getElementById("sourceInfo");
const tradeActionEl = document.getElementById("tradeAction");
const tradeStrikeEl = document.getElementById("tradeStrike");
const tradeEntryEl = document.getElementById("tradeEntry");
const tradeStopLossEl = document.getElementById("tradeStopLoss");
const tradeTargetEl = document.getElementById("tradeTarget");
const tradePointsEl = document.getElementById("tradePoints");
const tradeRiskTagEl = document.getElementById("tradeRiskTag");
const tradeConfluenceEl = document.getElementById("tradeConfluence");
const tradeMarketStructureEl = document.getElementById("tradeMarketStructure");
const tradeGlobalSentimentEl = document.getElementById("tradeGlobalSentiment");
const tradeSupportResistanceEl = document.getElementById("tradeSupportResistance");
const tradeVolumeFlowEl = document.getElementById("tradeVolumeFlow");
const tradeSentimentEngineEl = document.getElementById("tradeSentimentEngine");
const tradeOptionChainEl = document.getElementById("tradeOptionChain");
const tradePcrEl = document.getElementById("tradePcr");
const tradeFiiDiiEl = document.getElementById("tradeFiiDii");
const tradeTechnicalEl = document.getElementById("tradeTechnical");
const tradeRsiEmaEl = document.getElementById("tradeRsiEma");
const tradeNewsEl = document.getElementById("tradeNews");
const tradeGiftNiftyEl = document.getElementById("tradeGiftNifty");
const tradeRationaleEl = document.getElementById("tradeRationale");
const tomorrowSentimentEl = document.getElementById("tomorrowSentiment");
const sentimentScoreTextEl = document.getElementById("sentimentScoreText");
const sentimentColorIndicatorEl = document.getElementById("sentimentColorIndicator");
const sentimentGeneratedAtEl = document.getElementById("sentimentGeneratedAt");
const globalSentimentResultEl = document.getElementById("globalSentimentResult");
const giftNiftyResultEl = document.getElementById("giftNiftyResult");
const optionChainResultEl = document.getElementById("optionChainResult");
const pcrRatioResultEl = document.getElementById("pcrRatioResult");
const supportLevelResultEl = document.getElementById("supportLevelResult");
const resistanceLevelResultEl = document.getElementById("resistanceLevelResult");
const fiiActivityResultEl = document.getElementById("fiiActivityResult");
const technicalResultEl = document.getElementById("technicalResult");
const rsiEmaResultEl = document.getElementById("rsiEmaResult");
const newsSentimentResultEl = document.getElementById("newsSentimentResult");
const newsHeadlinesEl = document.getElementById("newsHeadlines");

const callPutCanvas = document.getElementById("callPutChart");
const strikeCanvas = document.getElementById("strikeChart");
const callPutCtx = callPutCanvas ? callPutCanvas.getContext("2d") : null;
const strikeCtx = strikeCanvas ? strikeCanvas.getContext("2d") : null;
const sentimentGaugeCtx = document.getElementById("sentimentGauge").getContext("2d");

let callPutChart;
let strikeChart;
let sentimentGaugeChart;

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) {
    return;
  }

  if (isLoading) {
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  button.textContent = defaultText;
}

function ensurePageProgress() {
  const existing = document.getElementById("pageProgressOverlay");
  if (existing) {
    return existing;
  }

  const wrapper = document.createElement("section");
  wrapper.id = "pageProgressOverlay";
  wrapper.className = "page-progress hidden";
  wrapper.setAttribute("aria-live", "polite");
  wrapper.setAttribute("aria-busy", "false");
  wrapper.innerHTML =
    '<div class="page-progress-panel"><p class="page-progress-text">Loading data...</p><div class="page-progress-track"><div class="page-progress-bar"></div></div></div>';
  document.body.appendChild(wrapper);
  return wrapper;
}

const pageProgressEl = ensurePageProgress();

function setPageProgress(isVisible, message = "Loading data...") {
  if (!pageProgressEl) {
    return;
  }

  const textEl = pageProgressEl.querySelector(".page-progress-text");
  if (textEl) {
    textEl.textContent = message;
  }

  pageProgressEl.classList.toggle("hidden", !isVisible);
  pageProgressEl.setAttribute("aria-busy", isVisible ? "true" : "false");
}

function formatNumber(value) {
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString("en-IN") : "--";
  } catch (error) {
    return "--";
  }
}

function updatePredictionStyle(prediction) {
  predictionEl.classList.remove("bull", "bear", "neutral");

  if (prediction === "UP") {
    predictionEl.classList.add("bull");
  } else if (prediction === "DOWN") {
    predictionEl.classList.add("bear");
  } else {
    predictionEl.classList.add("neutral");
  }
}

function updateTradeStyle(action) {
  tradeActionEl.classList.remove("bull", "bear", "neutral");

  if (typeof action !== "string") {
    tradeActionEl.classList.add("neutral");
    return;
  }

  if (action.includes("SPOT BUY") || action.includes("CALL")) {
    tradeActionEl.classList.add("bull");
  } else if (action.includes("SPOT SELL") || action.includes("PUT")) {
    tradeActionEl.classList.add("bear");
  } else {
    tradeActionEl.classList.add("neutral");
  }
}

function updateRiskTagStyle(riskTag) {
  tradeRiskTagEl.classList.remove("risk-safe", "risk-cautious", "risk-wait");

  if (riskTag === "SAFE") {
    tradeRiskTagEl.classList.add("risk-safe");
  } else if (riskTag === "CAUTIOUS") {
    tradeRiskTagEl.classList.add("risk-cautious");
  } else {
    tradeRiskTagEl.classList.add("risk-wait");
  }
}

function updateConfluenceStyle(confluenceRatio) {
  tradeConfluenceEl.classList.remove("confluence-high", "confluence-medium", "confluence-low");

  const ratio = Number(confluenceRatio);
  if (Number.isFinite(ratio) && ratio >= 0.7) {
    tradeConfluenceEl.classList.add("confluence-high");
  } else if (Number.isFinite(ratio) && ratio >= 0.55) {
    tradeConfluenceEl.classList.add("confluence-medium");
  } else {
    tradeConfluenceEl.classList.add("confluence-low");
  }
}

function getSignalClass(signal) {
  if (signal === "BULLISH" || signal === "UP") {
    return "bull";
  }

  if (signal === "BEARISH" || signal === "DOWN") {
    return "bear";
  }

  return "neutral";
}

function updateSignalElement(element, signal) {
  element.classList.remove("bull", "bear", "neutral");
  element.classList.add(getSignalClass(signal));
}

function renderSentimentGauge(score, marketSentiment) {
  try {
    const boundedScore = Number.isFinite(Number(score)) ? Number(score) : 0;
    const normalized = Math.max(0, Math.min(14, boundedScore + 7));
    const fillColor =
      marketSentiment === "BULLISH"
        ? "rgba(66, 211, 146, 0.92)"
        : marketSentiment === "BEARISH"
          ? "rgba(255, 111, 111, 0.92)"
          : "rgba(243, 212, 124, 0.95)";

    if (sentimentGaugeChart) {
      sentimentGaugeChart.destroy();
    }

    sentimentGaugeChart = new Chart(sentimentGaugeCtx, {
      type: "doughnut",
      data: {
        labels: ["Sentiment", "Remaining"],
        datasets: [
          {
            data: [normalized, 14 - normalized],
            backgroundColor: [fillColor, "rgba(255, 255, 255, 0.14)"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        cutout: "70%",
        rotation: 270,
        circumference: 180,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        }
      },
      plugins: [
        {
          id: "sentimentGaugeCenterText",
          beforeDraw(chart) {
            const { ctx } = chart;
            const centerX = chart.width / 2;
            const centerY = chart.height * 0.74;

            ctx.save();
            ctx.textAlign = "center";
            ctx.fillStyle = "#f2f7ff";
            ctx.font = "700 20px Space Grotesk";
            ctx.fillText(String(boundedScore), centerX, centerY);
            ctx.fillStyle = "#a9c0d6";
            ctx.font = "500 12px Space Grotesk";
            ctx.fillText("Score", centerX, centerY + 18);
            ctx.restore();
          }
        }
      ]
    });
  } catch (error) {
    throw new Error(
      `Sentiment gauge render failed: ${error instanceof Error ? error.message : "Unknown gauge error"}`
    );
  }
}

function renderCharts(strikes) {
  try {
    if (!callPutCtx || !strikeCtx) {
      return;
    }

    const rows = Array.isArray(strikes) ? strikes : [];
    const sortedByActivity = [...rows]
      .sort((a, b) => b.callOI + b.putOI - (a.callOI + a.putOI))
      .slice(0, 16)
      .sort((a, b) => a.strikePrice - b.strikePrice);

    const labels = sortedByActivity.map((item) => item.strikePrice);
    const callData = sortedByActivity.map((item) => item.callOI);
    const putData = sortedByActivity.map((item) => item.putOI);

    if (callPutChart) {
      callPutChart.destroy();
    }

    if (strikeChart) {
      strikeChart.destroy();
    }

    callPutChart = new Chart(callPutCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Call OI",
            data: callData,
            borderColor: "rgba(255, 111, 111, 1)",
            backgroundColor: "rgba(255, 111, 111, 0.2)",
            tension: 0.28,
            fill: true
          },
          {
            label: "Put OI",
            data: putData,
            borderColor: "rgba(66, 211, 146, 1)",
            backgroundColor: "rgba(66, 211, 146, 0.2)",
            tension: 0.28,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#f2f7ff"
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#c9d8e5" },
            grid: { color: "rgba(255, 255, 255, 0.09)" }
          },
          y: {
            ticks: { color: "#c9d8e5" },
            grid: { color: "rgba(255, 255, 255, 0.09)" }
          }
        }
      }
    });

    strikeChart = new Chart(strikeCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Call OI",
            data: callData,
            backgroundColor: "rgba(255, 111, 111, 0.72)"
          },
          {
            label: "Put OI",
            data: putData,
            backgroundColor: "rgba(66, 211, 146, 0.72)"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#f2f7ff"
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#c9d8e5" },
            grid: { color: "rgba(255, 255, 255, 0.09)" }
          },
          y: {
            ticks: { color: "#c9d8e5" },
            grid: { color: "rgba(255, 255, 255, 0.09)" }
          }
        }
      }
    });
  } catch (error) {
    throw new Error(`Chart render failed: ${error instanceof Error ? error.message : "Unknown chart error"}`);
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

async function runAnalysis() {
  setPageProgress(true, "Running market analysis...");
  setButtonLoading(runBtn, true, "Analyzing...", runBtnDefaultText);
  spinner.classList.remove("hidden");
  hideError();

  try {
    const response = await fetch("/analyze", {
      method: "GET"
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const details = errorPayload.details || `Request failed with status ${response.status}`;
      throw new Error(details);
    }

    const data = await response.json();

    priceEl.textContent = formatNumber(data.currentPrice);
    pcrEl.textContent = data.pcr;
    supportEl.textContent = formatNumber(data.support);
    resistanceEl.textContent = formatNumber(data.resistance);
    callBuildupEl.textContent = formatNumber(data.callBuildup);
    putBuildupEl.textContent = formatNumber(data.putBuildup);
    predictionEl.textContent = data.prediction;
    marketBiasEl.textContent = `Bias: ${data.marketBias}`;
    predictionReasonEl.textContent = `Reason: ${data.predictionReason || "Not available"}`;
    buildupSignalEl.textContent = `Buildup: ${data.buildupSignal}`;
    const expiryText = data.fallbackExpiry ? ` | Expiry: ${data.fallbackExpiry}` : "";
    const qualityText = data.dataQuality?.level ? ` | Quality: ${data.dataQuality.level}` : "";
    const confidenceText = data.predictionConfidence
      ? ` | Prediction Confidence: ${data.predictionConfidence}`
      : "";
    const cacheText = data.cachedAt ? ` | Cache: ${new Date(data.cachedAt).toLocaleTimeString("en-IN")}` : "";
    const basisText = data.predictionBasis ? ` | Prediction Basis: ${data.predictionBasis}` : "";
    const sentimentEngineText = data.marketSentimentAnalyzer
      ? ` | Sentiment Engine: ${data.marketSentimentAnalyzer.marketSentiment || "NEUTRAL"} (${data.marketSentimentAnalyzer.totalScore ?? 0})`
      : "";
    sourceInfoEl.textContent = `Source: ${data.dataSource || "NSE_OPTION_CHAIN"} | Buildup Mode: ${data.buildupMode || "CHANGE_IN_OI"}${basisText}${sentimentEngineText}${confidenceText}${qualityText}${expiryText}${cacheText}`;
    updatePredictionStyle(data.prediction);

    const tradeSetup = data.tradeSetup || {};
    const tradeFactors = tradeSetup.factors || {};
    tradeActionEl.textContent = tradeSetup.action || "NO TRADE";
    tradeStrikeEl.textContent = `${formatNumber(tradeSetup.strikePrice)} ${tradeSetup.optionType || ""}`.trim();
    tradeEntryEl.textContent = tradeSetup.entryLevel !== undefined ? formatNumber(tradeSetup.entryLevel) : "--";
    tradeStopLossEl.textContent = tradeSetup.stopLoss !== undefined ? formatNumber(tradeSetup.stopLoss) : "--";
    tradeTargetEl.textContent = tradeSetup.target !== undefined ? formatNumber(tradeSetup.target) : "--";
    tradePointsEl.textContent = tradeSetup.targetPoints || "--";
    tradeRiskTagEl.textContent = tradeSetup.riskTag || "WAIT";
    const confluenceRatio = Number(tradeSetup.confluenceRatio);
    tradeConfluenceEl.textContent = Number.isFinite(confluenceRatio)
      ? `${Math.round(confluenceRatio * 100)}%`
      : "--";
    tradeMarketStructureEl.textContent = `${tradeFactors.marketStructure?.signal || "NEUTRAL"} | ${tradeFactors.marketStructure?.detail || "Not available"}`;
    tradeGlobalSentimentEl.textContent = `${tradeFactors.globalSentiment?.signal || "NEUTRAL"} | ${tradeFactors.globalSentiment?.detail || "Not available"}`;
    tradeSupportResistanceEl.textContent = `${tradeFactors.supportResistance?.signal || "NEUTRAL"} | ${tradeFactors.supportResistance?.detail || "Not available"}`;
    tradeVolumeFlowEl.textContent = `${tradeFactors.volumeFlow?.signal || "NEUTRAL"} | ${tradeFactors.volumeFlow?.detail || "Not available"}`;
    tradeSentimentEngineEl.textContent = `${tradeFactors.sentimentEngine?.signal || "NEUTRAL"} | ${tradeFactors.sentimentEngine?.detail || "Not available"}`;
    tradeOptionChainEl.textContent = `${tradeFactors.optionChain?.signal || "NEUTRAL"} | ${tradeFactors.optionChain?.detail || "Not available"}`;
    tradePcrEl.textContent = `${tradeFactors.pcr?.signal || "NEUTRAL"} | ${tradeFactors.pcr?.detail || "Not available"}`;
    tradeFiiDiiEl.textContent = `${tradeFactors.fiiDii?.signal || "NEUTRAL"} | ${tradeFactors.fiiDii?.detail || "Not available"}`;
    tradeTechnicalEl.textContent = `${tradeFactors.technicalIndicators?.signal || "NEUTRAL"} | ${tradeFactors.technicalIndicators?.detail || "Not available"}`;
    tradeRsiEmaEl.textContent = `${tradeFactors.rsiEmaSignal?.signal || "NEUTRAL"} | ${tradeFactors.rsiEmaSignal?.detail || "Not available"}`;
    tradeNewsEl.textContent = `${tradeFactors.newsSentiment?.signal || "NEUTRAL"} | ${tradeFactors.newsSentiment?.detail || "Not available"}`;
    tradeGiftNiftyEl.textContent = `${tradeFactors.giftNifty?.signal || "NEUTRAL"} | ${tradeFactors.giftNifty?.detail || "Not available"}`;
    const executionBasis = tradeSetup.executionBasis ? `Execution: ${tradeSetup.executionBasis}` : "";
    const confirmation = tradeSetup.confirmationInstrument ? ` | Confirmation: ${tradeSetup.confirmationInstrument}` : "";
    const weightedScoreText =
      tradeSetup.weightedDecisionScore !== undefined && tradeSetup.weightedDecisionThreshold !== undefined
        ? ` | Weighted Score: ${tradeSetup.weightedDecisionScore} (Threshold ${tradeSetup.weightedDecisionThreshold})`
        : "";
    tradeRationaleEl.textContent = `Rationale: ${tradeSetup.rationale || "Not available"}${executionBasis ? ` | ${executionBasis}` : ""}${confirmation}${weightedScoreText}`;
    updateTradeStyle(tradeSetup.action || "NO TRADE");
    updateRiskTagStyle(tradeSetup.riskTag || "WAIT");
    updateConfluenceStyle(tradeSetup.confluenceRatio);

    const date = new Date(data.lastUpdated);
    lastUpdated.textContent = `Last update: ${date.toLocaleString("en-IN")}`;

    renderCharts(data.strikes);
    await runSentimentAnalysis();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected analysis error";
    showError(`Unable to run market analysis. ${message}`);
  } finally {
    setPageProgress(false);
    setButtonLoading(runBtn, false, "Analyzing...", runBtnDefaultText);
    spinner.classList.add("hidden");
  }
}

async function runSentimentAnalysis() {
  try {
    const response = await fetch("/api/final-sentiment", {
      method: "GET"
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const details = errorPayload.details || `Request failed with status ${response.status}`;
      throw new Error(details);
    }

    const data = await response.json();
    const details = data.details || {};
    const globalMarket = details.globalMarket || {};
    const giftNifty = details.giftNifty || {};
    const optionChain = details.optionChain || {};
    const pcr = details.pcr || {};
    const fiiDii = details.fiiDii || {};
    const technical = details.technicalIndicators || {};
    const rsiEma = details.rsiEmaSignal || {};
    const news = details.newsSentiment || {};

    tomorrowSentimentEl.textContent = data.marketSentiment || "NEUTRAL";
    updateSignalElement(tomorrowSentimentEl, data.marketSentiment || "NEUTRAL");

    const minRange = data.scoreRange?.min ?? -7;
    const maxRange = data.scoreRange?.max ?? 7;
    sentimentScoreTextEl.textContent = `Score: ${data.totalScore ?? 0} (Range: ${minRange} to ${maxRange})`;
    sentimentColorIndicatorEl.textContent = `Color: ${data.colorIndicator || "YELLOW"}`;

    const globalDow = Number(globalMarket.indices?.dowJones || 0).toFixed(2);
    const globalNasdaq = Number(globalMarket.indices?.nasdaq || 0).toFixed(2);
    const globalSp = Number(globalMarket.indices?.sp500 || 0).toFixed(2);
    globalSentimentResultEl.textContent = `${globalMarket.signal || "NEUTRAL"} | Dow ${globalDow}% | Nasdaq ${globalNasdaq}% | S&P ${globalSp}%`;
    updateSignalElement(globalSentimentResultEl, globalMarket.signal || "NEUTRAL");

    giftNiftyResultEl.textContent = `${giftNifty.signal || "NEUTRAL"} | ${giftNifty.ticker || "GIFTNIFTY"} | ${formatNumber(giftNifty.currentPrice)} (${giftNifty.pointDifference ?? 0} pts)`;
    updateSignalElement(giftNiftyResultEl, giftNifty.signal || "NEUTRAL");

    optionChainResultEl.textContent = `${optionChain.signal || "NEUTRAL"} | Highest PUT OI ${formatNumber(optionChain.highestPutOI)} vs CALL OI ${formatNumber(optionChain.highestCallOI)}`;
    updateSignalElement(optionChainResultEl, optionChain.signal || "NEUTRAL");

    pcrRatioResultEl.textContent = `${Number(pcr.value || 0).toFixed(4)} | ${pcr.signal || "NEUTRAL"}`;
    updateSignalElement(pcrRatioResultEl, pcr.signal || "NEUTRAL");

    supportLevelResultEl.textContent = formatNumber(optionChain.support);
    resistanceLevelResultEl.textContent = formatNumber(optionChain.resistance);

    fiiActivityResultEl.textContent = `${fiiDii.signal || "NEUTRAL"} | Buy ${formatNumber(fiiDii.fiiBuyValue)} | Sell ${formatNumber(fiiDii.fiiSellValue)} | Net ${formatNumber(fiiDii.fiiNetValue)}`;
    updateSignalElement(fiiActivityResultEl, fiiDii.signal || "NEUTRAL");

    technicalResultEl.textContent = `${technical.signal || "NEUTRAL"} | RSI ${Number(technical.rsi || 0).toFixed(2)} | MA50 ${formatNumber(technical.ma50)} | MA200 ${formatNumber(technical.ma200)}`;
    updateSignalElement(technicalResultEl, technical.signal || "NEUTRAL");

    rsiEmaResultEl.textContent = `${rsiEma.signal || "NEUTRAL"} | ${rsiEma.setup || "No-trade / Wait"} | EMA9 ${Number(rsiEma.ema9 || 0).toFixed(2)} | EMA21 ${Number(rsiEma.ema21 || 0).toFixed(2)} | RSI14 ${Number(rsiEma.rsi14 || 0).toFixed(2)}`;
    updateSignalElement(rsiEmaResultEl, rsiEma.signal || "NEUTRAL");

    newsSentimentResultEl.textContent = `${news.signal || "NEUTRAL"} | Score ${news.newsScore ?? 0} | Bullish hits ${news.bullishHits ?? 0} | Bearish hits ${news.bearishHits ?? 0}`;
    updateSignalElement(newsSentimentResultEl, news.signal || "NEUTRAL");

    const headlines = Array.isArray(news.topHeadlines) ? news.topHeadlines : [];
    newsHeadlinesEl.textContent = headlines.length > 0 ? headlines.join(" | ") : "No headlines available";

    sentimentGeneratedAtEl.textContent = `Generated: ${new Date(data.generatedAt).toLocaleString("en-IN")}`;

    renderSentimentGauge(data.totalScore ?? 0, data.marketSentiment || "NEUTRAL");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected sentiment analysis error";
    showError(`Unable to run market sentiment analysis. ${message}`);
  }
}

runBtn.addEventListener("click", () => {
  runAnalysis().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected click handler error";
    showError(`Action failed. ${message}`);
  });
});
