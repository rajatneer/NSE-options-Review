const path = require("path");
const express = require("express");
const axios = require("axios");
const { analyzeMarket } = require("./analysis");

const app = express();
const PORT = process.env.PORT || 3000;

const NSE_BASE_URL = "https://www.nseindia.com";
const API_PATH = "/api/option-chain-indices?symbol=NIFTY";
const SNAPSHOT_CONTRACTS_PATH = "/api/snapshot-derivatives-equity?index=contracts&limit=5000";
const SNAPSHOT_OI_PATH = "/api/snapshot-derivatives-equity?index=oi&limit=5000";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasOptionRows(payload) {
  const recordRows = payload?.records?.data;
  const filteredRows = payload?.filtered?.data;

  return (
    (Array.isArray(recordRows) && recordRows.length > 0) ||
    (Array.isArray(filteredRows) && filteredRows.length > 0)
  );
}

function parseNseExpiryDate(dateText) {
  try {
    if (typeof dateText !== "string" || dateText.trim() === "") {
      throw new TypeError("Invalid NSE expiry date text");
    }

    const parsed = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) {
      throw new RangeError(`Unable to parse NSE expiry date: ${dateText}`);
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Expiry parsing failed: ${error.message}`);
    }

    throw new Error("Expiry parsing failed with unknown error");
  }
}

function transformSnapshotToOptionChain(snapshotPayload) {
  try {
    const rows = snapshotPayload?.volume?.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError("Snapshot payload missing volume.data rows");
    }

    const dedupedRows = [...new Map(rows.map((row) => [row.identifier, row])).values()];

    const optionRows = dedupedRows.filter(
      (row) =>
        row &&
        row.instrumentType === "OPTIDX" &&
        row.underlying === "NIFTY" &&
        (row.optionType === "Call" || row.optionType === "Put")
    );

    if (optionRows.length === 0) {
      throw new RangeError("Snapshot payload has no NIFTY OPTIDX rows");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uniqueExpiries = [...new Set(optionRows.map((row) => row.expiryDate))]
      .filter((value) => typeof value === "string" && value.length > 0)
      .map((value) => ({
        text: value,
        date: parseNseExpiryDate(value)
      }))
      .sort((a, b) => a.date - b.date);

    if (uniqueExpiries.length === 0) {
      throw new RangeError("Snapshot payload has no parseable expiries");
    }

    const nearest = uniqueExpiries.find((item) => item.date >= today) || uniqueExpiries[0];

    const nearestRows = optionRows.filter((row) => row.expiryDate === nearest.text);
    if (nearestRows.length === 0) {
      throw new RangeError("Snapshot nearest expiry has no rows");
    }

    const strikeMap = new Map();
    let underlyingValue = 0;

    nearestRows.forEach((row) => {
      const strike = Number(row.strikePrice);
      if (!Number.isFinite(strike)) {
        return;
      }

      underlyingValue = Number(row.underlyingValue) || underlyingValue;

      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          strikePrice: strike
        });
      }

      const item = strikeMap.get(strike);
      const optionNode = {
        openInterest: Number(row.openInterest) || 0,
        changeinOpenInterest: Number(row.changeinOpenInterest || row.changeInOpenInterest) || 0,
        totalTradedVolume: Number(row.numberOfContractsTraded) || 0
      };

      if (row.optionType === "Call") {
        item.CE = optionNode;
      } else if (row.optionType === "Put") {
        item.PE = optionNode;
      }
    });

    const transformedRows = [...strikeMap.values()].sort((a, b) => a.strikePrice - b.strikePrice);
    if (transformedRows.length === 0) {
      throw new RangeError("Snapshot transform produced zero strike rows");
    }

    return {
      payload: {
        records: {
          underlyingValue,
          data: transformedRows
        }
      },
      source: "NSE_SNAPSHOT_FALLBACK",
      fallbackExpiry: nearest.text
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Snapshot transform failed: ${error.message}`);
    }

    throw new Error("Snapshot transform failed with unknown error");
  }
}

function buildHeaders(cookie = "") {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
    Referer: `${NSE_BASE_URL}/option-chain`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    ...(cookie ? { Cookie: cookie } : {})
  };
}

function extractCookieHeader(setCookieHeader) {
  try {
    if (!Array.isArray(setCookieHeader)) {
      throw new TypeError("Set-Cookie header is not an array");
    }

    return setCookieHeader
      .map((cookieString) => cookieString.split(";")[0])
      .join("; ");
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`Cookie extraction failed: ${error.message}`);
    }

    throw new Error("Cookie extraction failed with unknown error");
  }
}

async function bootstrapCookies(client) {
  try {
    const homeResponse = await client.get("/", {
      headers: buildHeaders()
    });
    const pageResponse = await client.get("/option-chain", {
      headers: buildHeaders()
    });

    const setCookieHeader = [
      ...(homeResponse.headers["set-cookie"] || []),
      ...(pageResponse.headers["set-cookie"] || [])
    ];
    return extractCookieHeader(setCookieHeader || []);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || "NoStatus";
      throw new Error(`NSE cookie bootstrap request failed (${status})`);
    }

    if (error instanceof TypeError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(`NSE cookie bootstrap failed: ${error.message}`);
    }

    throw new Error("NSE cookie bootstrap failed with unknown error");
  }
}

async function fetchNseOptionChain() {
  const client = axios.create({
    baseURL: NSE_BASE_URL,
    timeout: 20000,
    validateStatus: (status) => status >= 200 && status < 500
  });

  try {
    let lastStatus = "NoStatus";
    let lastBodyHint = "No response body";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const cookie = await bootstrapCookies(client);
      const response = await client.get(`${API_PATH}&_=${Date.now()}`, {
        headers: buildHeaders(cookie)
      });

      lastStatus = response.status;
      lastBodyHint = JSON.stringify(response.data || {}).slice(0, 300);

      if (response.status === 200 && response.data && hasOptionRows(response.data)) {
        return {
          payload: response.data,
          source: "NSE_OPTION_CHAIN"
        };
      }

      await sleep(450 * attempt);
    }

    const [contractsResponse, oiResponse] = await Promise.all([
      client.get(`${SNAPSHOT_CONTRACTS_PATH}&_=${Date.now()}`, {
        headers: buildHeaders("")
      }),
      client.get(`${SNAPSHOT_OI_PATH}&_=${Date.now()}`, {
        headers: buildHeaders("")
      })
    ]);

    if (
      contractsResponse.status !== 200 ||
      !contractsResponse.data ||
      oiResponse.status !== 200 ||
      !oiResponse.data
    ) {
      throw new Error(
        `NSE returned empty/blocked option payload and fallback failed (contracts ${contractsResponse.status}, oi ${oiResponse.status})`
      );
    }

    const mergedSnapshotPayload = {
      volume: {
        data: [
          ...(contractsResponse.data.volume?.data || []),
          ...(oiResponse.data.volume?.data || [])
        ]
      }
    };

    const transformed = transformSnapshotToOptionChain(mergedSnapshotPayload);
    return transformed;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || "NoStatus";
      const details = error.response?.data ? JSON.stringify(error.response.data) : "No body";
      throw new Error(`Failed to fetch NSE option chain (${status}) - ${details}`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to fetch NSE option chain with unknown error");
  }
}

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/analyze", async (req, res) => {
  try {
    const nseResponse = await fetchNseOptionChain();
    const analysis = analyzeMarket(nseResponse.payload);

    res.json({
      pcr: analysis.pcr,
      support: analysis.support,
      resistance: analysis.resistance,
      callBuildup: analysis.callBuildup,
      putBuildup: analysis.putBuildup,
      prediction: analysis.prediction,
      marketBias: analysis.marketBias,
      buildupSignal: analysis.buildupSignal,
      buildupMode: analysis.buildupMode,
      currentPrice: analysis.currentPrice,
      lastUpdated: analysis.analyzedAt,
      strikes: analysis.strikes,
      dataSource: nseResponse.source,
      fallbackExpiry: nseResponse.fallbackExpiry || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("[ANALYZE_ERROR]", message, error);

    const status = message.includes("NSE") ? 502 : 500;

    res.status(status).json({
      error: "Analysis failed",
      details: message
    });
  }
});

app.get("*", (req, res) => {
  try {
    res.sendFile(path.join(__dirname, "..", "client", "index.html"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected file serving error";
    console.error("[STATIC_ERROR]", message, error);
    res.status(500).send("Unable to load dashboard");
  }
});

app.listen(PORT, () => {
  console.log(`NSE analyzer running on http://localhost:${PORT}`);
});
