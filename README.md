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

## Deploy on Render (Free Plan)

This app is already compatible with Render free web service hosting.

### 1. Push code to GitHub

Make sure this project is in a GitHub repository.

### 2. Create Render Web Service

In Render:

1. Click `New +`
2. Select `Web Service`
3. Connect your GitHub repo
4. Use these settings:

- Runtime: `Node`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`
- Plan: `Free`

### 3. Auto deploy using render.yaml

This repo includes `render.yaml`, so Render can auto-detect deployment settings.

### 4. Open deployed app

Render gives you a URL like:

- `https://your-service-name.onrender.com`

### Important Free Plan Notes

- Free services can spin down when idle and take time to wake up.
- NSE may block some cloud IP ranges. If primary option-chain calls are blocked, this app uses fallback logic and marks confidence in the response.

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
