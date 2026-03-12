# NSE Option Chain Analyzer (NIFTY)

A full-stack Node.js + Express + HTML/CSS/JS dashboard that fetches NSE option chain data, analyzes OI metrics, and predicts short-term market direction as `UP`, `DOWN`, or `SIDEWAYS`.

## Project Structure

```
/project
  /server
    server.js
    analysis.js
  /client
    index.html
    style.css
    script.js
  package.json
```

## Features

- `GET /analyze` backend API route
- Fetches NSE option chain for NIFTY from:
  - `https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY`
- Handles NSE session bootstrap (cookies + browser headers)
- Analysis logic:
  - Total Call/Put OI
  - PCR calculation
  - Strong support/resistance (highest Put OI / Call OI)
  - Call vs Put OI buildup (positive change in OI)
  - Market prediction rules
- Frontend dashboard includes:
  - Run button
  - Loading spinner
  - Last update timestamp
  - Color-coded prediction
  - Chart.js visualizations

## Analysis Rules

- `PCR = TotalPutOI / TotalCallOI`
- If `PCR > 1.2` => Bullish => `UP`
- If `PCR < 0.8` => Bearish => `DOWN`
- Else => Sideways => `SIDEWAYS`

Fresh buildup signal:

- If Call OI increase > Put OI increase => Bearish pressure
- If Put OI increase > Call OI increase => Bullish pressure

## Run Locally

1. Open terminal in project folder:

```bash
cd C:/Users/rstra/nse-option-analyzer
```

2. Install dependencies:

```bash
npm install
```

3. Start app:

```bash
npm start
```

4. Open browser:

- `http://localhost:3000`

## API Response Shape

`GET /analyze` returns:

```json
{
  "pcr": 1.0321,
  "support": 22500,
  "resistance": 22700,
  "callBuildup": 123456,
  "putBuildup": 113245,
  "prediction": "SIDEWAYS",
  "marketBias": "Sideways",
  "buildupSignal": "Bearish pressure",
  "currentPrice": 22642.8,
  "lastUpdated": "2026-03-12T16:44:13.221Z",
  "strikes": []
}
```

## Notes on NSE Access

NSE may intermittently block automated requests and return an empty payload (`{}`) despite status `200`.

This app handles that by:

- Retrying multiple times with refreshed cookies
- Returning `502` with a clear JSON error if blocked

Example error:

```json
{
  "error": "Analysis failed",
  "details": "NSE returned empty/blocked option payload after retries (status 200, body {})"
}
```
