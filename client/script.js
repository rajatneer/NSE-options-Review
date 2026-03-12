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
const buildupSignalEl = document.getElementById("buildupSignal");
const sourceInfoEl = document.getElementById("sourceInfo");

const callPutCtx = document.getElementById("callPutChart").getContext("2d");
const strikeCtx = document.getElementById("strikeChart").getContext("2d");

let callPutChart;
let strikeChart;

function formatNumber(value) {
  try {
    return Number(value).toLocaleString("en-IN");
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
    buildupSignalEl.textContent = `Buildup: ${data.buildupSignal}`;
    const expiryText = data.fallbackExpiry ? ` | Expiry: ${data.fallbackExpiry}` : "";
    sourceInfoEl.textContent = `Source: ${data.dataSource || "NSE_OPTION_CHAIN"} | Buildup Mode: ${data.buildupMode || "CHANGE_IN_OI"}${expiryText}`;
    updatePredictionStyle(data.prediction);

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
