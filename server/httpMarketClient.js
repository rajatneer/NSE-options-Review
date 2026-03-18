const axios = require("axios");

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

function createHttpMarketClient() {
  const client = axios.create({
    timeout: 15000,
    validateStatus: (status) => status >= 200 && status < 500,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      Accept: "application/json"
    }
  });

  async function getYahooChart(symbol, options = {}) {
    try {
      if (typeof symbol !== "string" || symbol.trim() === "") {
        throw new TypeError("Yahoo chart symbol is required");
      }

      const range = typeof options.range === "string" && options.range.trim() ? options.range : "3mo";
      const interval =
        typeof options.interval === "string" && options.interval.trim() ? options.interval : "1d";

      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await client.get(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}`, {
            params: {
              interval,
              range
            }
          });

          if (response.status !== 200 || !response.data) {
            throw new Error(`Yahoo chart invalid response (${response.status})`);
          }

          return response.data;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) => {
              setTimeout(resolve, 350 * attempt);
            });
          }
        }
      }

      if (lastError instanceof TypeError) {
        throw lastError;
      }

      if (axios.isAxiosError(lastError)) {
        const status = lastError.response?.status || "NoStatus";
        throw new Error(`Yahoo chart request failed (${status})`);
      }

      if (lastError instanceof Error) {
        throw lastError;
      }

      throw new Error("Yahoo chart request failed with unknown error");
    } catch (error) {
      if (error instanceof TypeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Yahoo chart fetch failed: ${error.message}`);
      }

      throw new Error("Yahoo chart fetch failed with unknown error");
    }
  }

  return {
    getYahooChart
  };
}

module.exports = {
  createHttpMarketClient
};
