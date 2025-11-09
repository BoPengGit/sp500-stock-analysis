/**
 * GARP (Growth at Reasonable Price) Service
 *
 * Screens stocks based on a combination of growth and value metrics:
 * - Growth metrics: Sales Growth, ROIC, Operating Margin
 * - Value metrics: P/E Ratio, PEG Ratio
 * - Quality metrics: Debt-to-Equity, FCF Yield
 */

const { getStocksFromDB } = require('../database/db');

class GARPService {
  /**
   * Calculate GARP score for a stock
   * Lower score is better (similar to ranking system)
   *
   * Scoring methodology:
   * - Lower P/E and PEG ratios = better value
   * - Higher sales growth, ROIC, operating margin = better growth
   * - Lower debt-to-equity = better quality
   * - Higher FCF yield = better cash generation
   */
  calculateGARPScore(stock) {
    let score = 0;
    let componentsCount = 0;

    // Value metrics (lower is better)
    if (stock.peRatio && stock.peRatio > 0) {
      score += stock.peRatio; // Penalize high P/E
      componentsCount++;
    }

    if (stock.pegRatio && stock.pegRatio > 0) {
      score += stock.pegRatio * 10; // Penalize high PEG (weighted)
      componentsCount++;
    }

    // Quality metrics
    if (stock.debtToEquity !== null && stock.debtToEquity !== undefined) {
      score += stock.debtToEquity * 5; // Penalize high debt
      componentsCount++;
    }

    // Growth metrics (higher is better, so subtract)
    if (stock.salesGrowth && stock.salesGrowth > 0) {
      score -= stock.salesGrowth * 0.5; // Reward high growth
      componentsCount++;
    }

    if (stock.roic && stock.roic > 0) {
      score -= stock.roic; // Reward high ROIC
      componentsCount++;
    }

    if (stock.operatingMargin && stock.operatingMargin > 0) {
      score -= stock.operatingMargin; // Reward high margin
      componentsCount++;
    }

    if (stock.fcfYield && stock.fcfYield > 0) {
      score -= stock.fcfYield * 2; // Reward high FCF yield (weighted)
      componentsCount++;
    }

    // Normalize by components count
    return componentsCount > 0 ? score / componentsCount : 999999;
  }

  /**
   * Filter stocks by GARP criteria
   */
  async filterByGARP(filters = {}) {
    const {
      maxPE = 30,
      maxPEG = 2,
      maxDebtToEquity = 2,
      minOperatingMargin = 10,
      minROIC = 10,
      minFCFYield = 2,
      minSalesGrowth = 10,
      limit = 50
    } = filters;

    // Get all stocks from database (includes GARP metrics)
    const stocks = await getStocksFromDB();

    // Filter stocks by GARP criteria
    const filtered = stocks.filter(stock => {
      // Must have at least some GARP metrics
      const hasGARPData = stock.peRatio || stock.pegRatio || stock.roic ||
                          stock.operatingMargin || stock.fcfYield;

      if (!hasGARPData) return false;

      // Apply filters
      if (stock.peRatio && stock.peRatio > maxPE) return false;
      if (stock.pegRatio && stock.pegRatio > maxPEG) return false;
      if (stock.debtToEquity && stock.debtToEquity > maxDebtToEquity) return false;
      if (stock.operatingMargin && stock.operatingMargin < minOperatingMargin) return false;
      if (stock.roic && stock.roic < minROIC) return false;
      if (stock.fcfYield && stock.fcfYield < minFCFYield) return false;
      if (stock.salesGrowth && stock.salesGrowth < minSalesGrowth) return false;

      return true;
    });

    // Calculate GARP score for each stock
    const withScores = filtered.map(stock => ({
      ...stock,
      garpScore: this.calculateGARPScore(stock)
    }));

    // Sort by GARP score (lower is better)
    const sorted = withScores.sort((a, b) => a.garpScore - b.garpScore);

    // Return top N stocks
    return sorted.slice(0, limit);
  }

  /**
   * Get GARP metrics summary statistics
   */
  async getGARPStatistics() {
    const stocks = await getStocksFromDB();

    const withGARPData = stocks.filter(stock =>
      stock.peRatio || stock.pegRatio || stock.roic ||
      stock.operatingMargin || stock.fcfYield
    );

    const stats = {
      totalStocks: stocks.length,
      stocksWithGARPData: withGARPData.length,
      coverage: (withGARPData.length / stocks.length * 100).toFixed(2) + '%',
      averages: {
        peRatio: this.calculateAverage(withGARPData, 'peRatio'),
        pegRatio: this.calculateAverage(withGARPData, 'pegRatio'),
        debtToEquity: this.calculateAverage(withGARPData, 'debtToEquity'),
        operatingMargin: this.calculateAverage(withGARPData, 'operatingMargin'),
        roic: this.calculateAverage(withGARPData, 'roic'),
        fcfYield: this.calculateAverage(withGARPData, 'fcfYield'),
        salesGrowth: this.calculateAverage(withGARPData, 'salesGrowth')
      }
    };

    return stats;
  }

  calculateAverage(stocks, metric) {
    const values = stocks
      .map(s => s[metric])
      .filter(v => v !== null && v !== undefined && !isNaN(v) && isFinite(v));

    if (values.length === 0) return null;

    const sum = values.reduce((acc, val) => acc + val, 0);
    return (sum / values.length).toFixed(2);
  }
}

module.exports = new GARPService();
