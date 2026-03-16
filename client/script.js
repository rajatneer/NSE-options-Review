const runBtn = document.getElementById("runBtn");
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
const tradeMarketStructureEl = document.getElementById("tradeMarketStructure");
const tradeGlobalSentimentEl = document.getElementById("tradeGlobalSentiment");
const tradeSupportResistanceEl = document.getElementById("tradeSupportResistance");
const tradeRationaleEl = document.getElementById("tradeRationale");
const tvTrendEl = document.getElementById("tvTrend");
const tvRsiEl = document.getElementById("tvRsi");
const tvMacdEl = document.getElementById("tvMacd");
const tvMaEl = document.getElementById("tvMa");
const tvOhlcEl = document.getElementById("tvOhlc");
const tvVolumeEl = document.getElementById("tvVolume");

const callPutCtx = document.getElementById("callPutChart").getContext("2d");
const strikeCtx = document.getElementById("strikeChart").getContext("2d");

let callPutChart;
let strikeChart;

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

function renderCharts(strikes) {
  try {
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
  runBtn.disabled = true;
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
    sourceInfoEl.textContent = `Source: ${data.dataSource || "NSE_OPTION_CHAIN"} | Buildup Mode: ${data.buildupMode || "CHANGE_IN_OI"}${basisText}${confidenceText}${qualityText}${expiryText}${cacheText}`;
    updatePredictionStyle(data.prediction);

    const chartDetails = data.chartDetails || {};
    const chartSignal = data.chartSignal || {};
    tvTrendEl.textContent = `${chartSignal.bias || "NEUTRAL"} | TV: ${chartDetails.recommendationLabel || "NEUTRAL"}`;
    tvRsiEl.textContent = chartDetails.rsi !== undefined ? Number(chartDetails.rsi).toFixed(2) : "--";
    tvMacdEl.textContent = `MACD ${formatNumber(chartDetails.macdValue)} / Signal ${formatNumber(chartDetails.macdSignal)}`;
    tvMaEl.textContent = `EMA20 ${formatNumber(chartDetails.ema20)} | EMA50 ${formatNumber(chartDetails.ema50)} | EMA200 ${formatNumber(chartDetails.ema200)}`;
    tvOhlcEl.textContent = `O ${formatNumber(chartDetails.open)} H ${formatNumber(chartDetails.high)} L ${formatNumber(chartDetails.low)} C ${formatNumber(chartDetails.close)}`;
    tvVolumeEl.textContent = `Vol ${formatNumber(chartDetails.volume)} | Chg ${chartDetails.changePercent !== undefined ? Number(chartDetails.changePercent).toFixed(2) + "%" : "--"}`;

    const tradeSetup = data.tradeSetup || {};
    const tradeFactors = tradeSetup.factors || {};
    tradeActionEl.textContent = tradeSetup.action || "NO TRADE";
    tradeStrikeEl.textContent = `${formatNumber(tradeSetup.strikePrice)} ${tradeSetup.optionType || ""}`.trim();
    tradeEntryEl.textContent = tradeSetup.entryLevel !== undefined ? formatNumber(tradeSetup.entryLevel) : "--";
    tradeStopLossEl.textContent = tradeSetup.stopLoss !== undefined ? formatNumber(tradeSetup.stopLoss) : "--";
    tradeTargetEl.textContent = tradeSetup.target !== undefined ? formatNumber(tradeSetup.target) : "--";
    tradePointsEl.textContent = tradeSetup.targetPoints || "--";
    tradeMarketStructureEl.textContent = `${tradeFactors.marketStructure?.signal || "NEUTRAL"} | ${tradeFactors.marketStructure?.detail || "Not available"}`;
    tradeGlobalSentimentEl.textContent = `${tradeFactors.globalSentiment?.signal || "NEUTRAL"} | ${tradeFactors.globalSentiment?.detail || "Not available"}`;
    tradeSupportResistanceEl.textContent = `${tradeFactors.supportResistance?.signal || "NEUTRAL"} | ${tradeFactors.supportResistance?.detail || "Not available"}`;
    const executionBasis = tradeSetup.executionBasis ? `Execution: ${tradeSetup.executionBasis}` : "";
    const confirmation = tradeSetup.confirmationInstrument ? ` | Confirmation: ${tradeSetup.confirmationInstrument}` : "";
    tradeRationaleEl.textContent = `Rationale: ${tradeSetup.rationale || "Not available"}${executionBasis ? ` | ${executionBasis}` : ""}${confirmation}`;
    updateTradeStyle(tradeSetup.action || "NO TRADE");

    const date = new Date(data.lastUpdated);
    lastUpdated.textContent = `Last update: ${date.toLocaleString("en-IN")}`;

    renderCharts(data.strikes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected analysis error";
    showError(`Unable to run market analysis. ${message}`);
  } finally {
    runBtn.disabled = false;
    spinner.classList.add("hidden");
  }
}

runBtn.addEventListener("click", () => {
  runAnalysis().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected click handler error";
    showError(`Action failed. ${message}`);
  });
});
