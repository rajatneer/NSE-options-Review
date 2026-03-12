function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

    return {
      currentPrice,
      pcr: Number(pcr.toFixed(4)),
      support: support.strikePrice,
      resistance: resistance.strikePrice,
      callBuildup,
      putBuildup,
      prediction,
      marketBias,
      buildupSignal,
      buildupMode: isChangeOiUnavailable ? "VOLUME_PROXY" : "CHANGE_IN_OI",
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
