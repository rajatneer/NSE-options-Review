function createMutualFundScoringService() {
  function scoreFund(fund, categoryAverageExpenseRatio) {
    try {
      if (!fund || typeof fund !== "object") {
        throw new TypeError("Fund object is required");
      }

      const avgExpense = Number.isFinite(categoryAverageExpenseRatio)
        ? categoryAverageExpenseRatio
        : Number(fund.ExpenseRatio || 0);

      let score = 0;
      const reasons = [];

      if (fund.Returns3Y > 12) {
        score += 25;
      }

      if (fund.Returns5Y > 12) {
        score += 25;
      }

      if (fund.Returns3Y > 12 && fund.Returns5Y > 12) {
        reasons.push("High 3Y and 5Y consistent returns");
      }

      if (fund.ExpenseRatio < 1) {
        score += 15;
        reasons.push("Low expense ratio compared to category");
      } else if (fund.ExpenseRatio <= avgExpense) {
        reasons.push("Expense ratio is better than category average");
      }

      if (fund.AUM > 5000) {
        score += 10;
        reasons.push("Stable fund with high AUM");
      }

      if (fund.SharpeRatio > 1) {
        score += 10;
        reasons.push("Strong risk-adjusted performance (Sharpe Ratio)");
      }

      if (fund.Beta < 1) {
        score += 10;
        reasons.push("Lower volatility (Beta)");
      }

      if (fund.Returns1Y > 10) {
        score += 5;
      }

      const reasonText =
        reasons.length > 0
          ? reasons[0]
          : "Balanced return and risk profile with stable long-term indicators.";

      return {
        SchemeName: fund.SchemeName,
        NAV: Number(fund.NAV || 0),
        Returns1Y: Number(fund.Returns1Y || 0),
        Returns3Y: Number(fund.Returns3Y || 0),
        Returns5Y: Number(fund.Returns5Y || 0),
        ExpenseRatio: Number(fund.ExpenseRatio || 0),
        AUM: Number(fund.AUM || 0),
        RiskLevel: String(fund.RiskLevel || "Moderate"),
        Reason: reasonText,
        WhyRecommended:
          reasons.length > 0
            ? reasons.join("; ")
            : "Balanced return and risk profile with stable long-term indicators.",
        Score: score
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new Error(`Mutual fund scoring failed: ${error.message}`);
      }

      throw new Error("Mutual fund scoring failed with unknown error");
    }
  }

  return {
    scoreFund
  };
}

module.exports = {
  createMutualFundScoringService
};
