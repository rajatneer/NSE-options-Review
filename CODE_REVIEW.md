# Code Review Report

Date: 2026-04-08
Project: nse-option-analyzer
Scope: Static review of server and client code for bugs, risks, regressions, and testing gaps.

## Executive Summary
The codebase has a solid defensive programming baseline, but there are several high-impact issues that should be addressed first:
- Duplicate upstream market data calls in the /analyze flow, increasing rate-limit and inconsistency risk.
- Raw internal/upstream error details are returned to clients, creating information disclosure risk.
- EMA fallback logic has a helper signature mismatch that can distort sentiment calculations.

## Findings (Ordered by Severity)

### 1) High - Duplicate upstream market-data calls in /analyze
- Evidence:
  - server/server.js:519 calls fetchNseOptionChain() and marketSentimentService.getFinalSentiment() in parallel.
  - server/marketSentimentService.js:730 getOptionChainSentiment() calls fetchNseOptionChain() again.
  - server/marketSentimentService.js:1047 getFinalSentiment() calls getGlobalSentiment() while server/server.js:521 separately calls fetchGlobalSentiment().
- Impact:
  - Increased external API load and latency.
  - Higher probability of rate-limit/temporary blocks.
  - Possible response inconsistency when two calls observe different market snapshots.
- Recommendation:
  - Fetch option chain/global sentiment once in /analyze and pass results into sentiment service.
  - Alternatively, use request-scoped memoization/context to deduplicate calls.

### 2) High - Error details are exposed to API consumers
- Evidence:
  - server/server.js:462 serializes upstream response body into error text.
  - server/server.js:562 returns details: message to clients.
  - server/server.js:489 shared error handler returns raw exception messages.
- Impact:
  - Leaks implementation and upstream failure details to external clients.
  - Increases reconnaissance surface.
- Recommendation:
  - Return stable public errors (code + generic message).
  - Keep verbose diagnostics only in server logs.

### 3) Medium - EMA fallback bug due helper signature mismatch
- Evidence:
  - server/marketSentimentService.js:22 defines toFiniteNumber(value) without fallback arg.
  - server/marketSentimentService.js:41 calls toFiniteNumber(values[i], ema) as if fallback is supported.
- Impact:
  - Invalid points become 0 instead of prior EMA, distorting EMA/RSI-EMA signals and sentiment score.
- Recommendation:
  - Add fallback support, e.g., toFiniteNumber(value, fallback = 0), or handle fallback explicitly in EMA loop.

### 4) Medium - Stock fallback dataset is not used on full upstream failure
- Evidence:
  - server/stockAnalysisService.js:327 defines getFallbackStocks().
  - server/stockAnalysisService.js:480 returns empty result on full failure.
  - server/stockAnalysisService.js:487 sets stocks: [].
- Impact:
  - User experience drops to empty data even though static fallback exists.
- Recommendation:
  - Use getFallbackStocks() when analyzedStocks is empty and mark source as fallback.

### 5) Low - Bullish trend threshold appears too permissive
- Evidence:
  - server/stockAnalysisService.js:255 labels bullish when bullishSignScore >= 1 out of 4 checks.
- Impact:
  - Potentially over-labels weak setups as bullish.
- Recommendation:
  - Tighten threshold to >= 2 or >= 3 based on intended confidence level.

### 6) Low - CDN script loaded without SRI
- Evidence:
  - client/index.html:14 loads Chart.js without integrity and crossorigin.
- Impact:
  - Avoidable supply-chain risk.
- Recommendation:
  - Pin version and add SRI hash + crossorigin, or self-host.

### 7) Low - README decision logic may not match implementation
- Evidence:
  - README.md:43-44 documents PCR rule thresholds.
  - server/analysis.js:833 now uses blended volume + sentiment score.
  - server/analysis.js:920 exposes final score details.
- Impact:
  - Confusion for users/operators; perceived behavior regression.
- Recommendation:
  - Update README to reflect current scoring methodology and thresholds.

## Test Coverage Gaps
- package.json:6-7 has no test script configured.
- No test/spec files were found in this workspace scan.

### Priority Test Additions
1. /analyze integration test to verify single-fetch semantics for option chain/global data.
2. Error-handling tests to ensure no raw upstream/internal detail is returned to clients.
3. Unit tests for EMA/RSI functions with missing/invalid candle inputs.
4. Stock service fallback test ensuring static fallback is used when all remote symbol calls fail.

## Notable Strengths
- Good resilience patterns with Promise.allSettled and graceful degradation in multiple services.
- Dynamic table rendering escapes HTML before insertion, reducing XSS risk.
- Option-chain caching exists and helps reduce repeated upstream hits in healthy paths.

## Suggested Remediation Order
1. Remove duplicate upstream calls in /analyze path.
2. Sanitize error responses returned by API endpoints.
3. Fix EMA fallback logic and add numerical unit tests.
4. Enable stock fallback data on full upstream failure.
5. Align README with current scoring behavior.
6. Add SRI for CDN assets.

## Review Notes
- This is a static code review only (no runtime load testing performed).
- Severity ranking is based on likely production impact under real API instability and user traffic.
