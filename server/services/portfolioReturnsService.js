/**
 * Portfolio Returns Service
 *
 * Calculates historical returns for an equal-weighted portfolio of stocks
 * Returns are calculated for 1-year, 3-year, 5-year, and 10-year periods
 */

const stockDataService = require('./stockDataService');

class PortfolioReturnsService {
  /**
   * Get price from historical data for a specific date
   * If exact date not found, get closest earlier date
   * Returns { price, date } or null
   */
  getPriceOnDate(historicalData, targetDate) {
    if (!historicalData || !historicalData.prices) {
      return null;
    }

    const target = new Date(targetDate);
    let closestPrice = null;
    let closestDate = null;
    let closestDiff = Infinity;

    for (const priceData of historicalData.prices) {
      const priceDate = new Date(priceData.date);
      const diff = target - priceDate;

      // Look for the closest date that is <= target date
      if (diff >= 0 && diff < closestDiff) {
        closestDiff = diff;
        closestPrice = priceData.adjClose;
        closestDate = priceData.date;
      }
    }

    return closestPrice !== null ? { price: closestPrice, date: closestDate } : null;
  }

  /**
   * Calculate return percentage for a single stock over a period
   */
  calculateReturn(startPrice, endPrice) {
    if (!startPrice || !endPrice || startPrice === 0) {
      return null;
    }
    return ((endPrice - startPrice) / startPrice) * 100;
  }

  /**
   * Calculate quarterly rebalance dates for a given period
   */
  getQuarterlyRebalanceDates(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      dates.push(new Date(current));
      // Add 3 months (approximately 91 days)
      current.setMonth(current.getMonth() + 3);
    }

    // Always include the end date
    if (dates[dates.length - 1].getTime() !== endDate.getTime()) {
      dates.push(new Date(endDate));
    }

    return dates;
  }

  /**
   * Calculate portfolio return with quarterly rebalancing
   * At each quarter, portfolio is rebalanced to equal weights
   */
  calculateQuarterlyRebalancedReturn(historicalDataArray, symbols, startDate, endDate) {
    const rebalanceDates = this.getQuarterlyRebalanceDates(startDate, endDate);

    if (rebalanceDates.length < 2) {
      return null;
    }

    // Start with $1 portfolio value
    let portfolioValue = 1.0;
    const equalWeight = 1.0 / symbols.length;

    // For each rebalancing period
    for (let i = 0; i < rebalanceDates.length - 1; i++) {
      const periodStart = rebalanceDates[i];
      const periodEnd = rebalanceDates[i + 1];

      // Get prices at start and end of period for each stock
      let periodReturn = 0;
      let validStocks = 0;

      for (let j = 0; j < symbols.length; j++) {
        const historicalData = historicalDataArray[j];

        if (!historicalData) {
          continue;
        }

        const startPriceData = this.getPriceOnDate(historicalData, periodStart);
        const endPriceData = this.getPriceOnDate(historicalData, periodEnd);

        if (!startPriceData || !endPriceData) {
          continue;
        }

        // Calculate this stock's return for the period
        const stockReturn = (endPriceData.price - startPriceData.price) / startPriceData.price;

        // Add weighted return (equal weight at start of period)
        periodReturn += stockReturn * equalWeight;
        validStocks++;
      }

      // If we have valid data, compound the portfolio value
      if (validStocks > 0) {
        portfolioValue *= (1 + periodReturn);
      }
    }

    // Calculate total return percentage
    const totalReturn = (portfolioValue - 1.0) * 100;

    return totalReturn;
  }

  /**
   * Calculate equal-weighted portfolio returns for multiple time periods
   * WITH QUARTERLY REBALANCING
   */
  async calculatePortfolioReturns(symbols) {
    console.log(`Calculating portfolio returns with quarterly rebalancing for ${symbols.length} stocks...`);

    // Fetch historical data for all symbols (4.99 years for Starter tier)
    const historicalDataPromises = symbols.map(symbol =>
      stockDataService.getHistoricalPrices(symbol, 4.99)
    );

    const historicalDataArray = await Promise.all(historicalDataPromises);

    // Check if we have any historical data at all
    const validHistoricalData = historicalDataArray.filter(data => data !== null && data.prices && data.prices.length > 0);
    if (validHistoricalData.length === 0) {
      throw new Error('No historical price data available. API may be down or rate limited.');
    }

    console.log(`Successfully fetched historical data for ${validHistoricalData.length}/${symbols.length} stocks`);

    // Calculate dates for each period
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(today.getFullYear() - 2);

    const threeYearsAgo = new Date(today);
    threeYearsAgo.setFullYear(today.getFullYear() - 3);

    const fourYearsAgo = new Date(today);
    fourYearsAgo.setFullYear(today.getFullYear() - 4);

    // Use 4.99 years to match the API fetch limit
    const fiveYearsAgo = new Date(today);
    const daysIn499Years = Math.floor(4.99 * 365);
    fiveYearsAgo.setDate(fiveYearsAgo.getDate() - daysIn499Years);

    // Calculate quarterly rebalanced returns for each period
    console.log('Calculating 1-year quarterly rebalanced return...');
    const oneYearTotalReturn = this.calculateQuarterlyRebalancedReturn(
      historicalDataArray, symbols, oneYearAgo, today
    );

    console.log('Calculating 2-year quarterly rebalanced return...');
    const twoYearTotalReturn = this.calculateQuarterlyRebalancedReturn(
      historicalDataArray, symbols, twoYearsAgo, today
    );

    console.log('Calculating 3-year quarterly rebalanced return...');
    const threeYearTotalReturn = this.calculateQuarterlyRebalancedReturn(
      historicalDataArray, symbols, threeYearsAgo, today
    );

    console.log('Calculating 4-year quarterly rebalanced return...');
    const fourYearTotalReturn = this.calculateQuarterlyRebalancedReturn(
      historicalDataArray, symbols, fourYearsAgo, today
    );

    console.log('Calculating 5-year quarterly rebalanced return...');
    const fiveYearTotalReturn = this.calculateQuarterlyRebalancedReturn(
      historicalDataArray, symbols, fiveYearsAgo, today
    );

    // Calculate actual time periods in years for annualization
    const actualOneYearPeriod = (today - oneYearAgo) / (365.25 * 24 * 60 * 60 * 1000);
    const actualTwoYearPeriod = (today - twoYearsAgo) / (365.25 * 24 * 60 * 60 * 1000);
    const actualThreeYearPeriod = (today - threeYearsAgo) / (365.25 * 24 * 60 * 60 * 1000);
    const actualFourYearPeriod = (today - fourYearsAgo) / (365.25 * 24 * 60 * 60 * 1000);
    const actualFiveYearPeriod = (today - fiveYearsAgo) / (365.25 * 24 * 60 * 60 * 1000);

    // Calculate annualized returns
    const oneYearAnnualized = oneYearTotalReturn; // 1-year doesn't need annualization
    const twoYearAnnualized = twoYearTotalReturn !== null
      ? this.calculateAnnualizedReturn(twoYearTotalReturn, actualTwoYearPeriod)
      : null;
    const threeYearAnnualized = threeYearTotalReturn !== null
      ? this.calculateAnnualizedReturn(threeYearTotalReturn, actualThreeYearPeriod)
      : null;
    const fourYearAnnualized = fourYearTotalReturn !== null
      ? this.calculateAnnualizedReturn(fourYearTotalReturn, actualFourYearPeriod)
      : null;
    const fiveYearAnnualized = fiveYearTotalReturn !== null
      ? this.calculateAnnualizedReturn(fiveYearTotalReturn, actualFiveYearPeriod)
      : null;

    // Calculate individual stock returns for reference (buy-and-hold)
    const stockReturns = [];
    const weight = 100 / symbols.length; // Equal weight percentage

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const historicalData = historicalDataArray[i];

      if (!historicalData) {
        console.log(`No historical data for ${symbol}, skipping...`);
        continue;
      }

      // Get current price (most recent)
      const currentPrice = historicalData.prices[0]?.adjClose;

      // Get historical prices
      const priceData1Year = this.getPriceOnDate(historicalData, oneYearAgo);
      const priceData2Year = this.getPriceOnDate(historicalData, twoYearsAgo);
      const priceData3Year = this.getPriceOnDate(historicalData, threeYearsAgo);
      const priceData4Year = this.getPriceOnDate(historicalData, fourYearsAgo);
      const priceData5Year = this.getPriceOnDate(historicalData, fiveYearsAgo);

      // Calculate individual stock returns (buy-and-hold for comparison)
      const oneYearReturn = priceData1Year ? this.calculateReturn(priceData1Year.price, currentPrice) : null;
      const twoYearReturn = priceData2Year ? this.calculateReturn(priceData2Year.price, currentPrice) : null;
      const threeYearReturn = priceData3Year ? this.calculateReturn(priceData3Year.price, currentPrice) : null;
      const fourYearReturn = priceData4Year ? this.calculateReturn(priceData4Year.price, currentPrice) : null;
      const fiveYearReturn = priceData5Year ? this.calculateReturn(priceData5Year.price, currentPrice) : null;

      stockReturns.push({
        symbol: symbol,
        weight: weight,
        currentPrice: currentPrice,
        returns: {
          oneYear: oneYearReturn,
          oneYearTotal: oneYearReturn,
          twoYear: twoYearReturn !== null ? this.calculateAnnualizedReturn(twoYearReturn, actualTwoYearPeriod) : null,
          twoYearTotal: twoYearReturn,
          threeYear: threeYearReturn !== null ? this.calculateAnnualizedReturn(threeYearReturn, actualThreeYearPeriod) : null,
          threeYearTotal: threeYearReturn,
          fourYear: fourYearReturn !== null ? this.calculateAnnualizedReturn(fourYearReturn, actualFourYearPeriod) : null,
          fourYearTotal: fourYearReturn,
          fiveYear: fiveYearReturn !== null ? this.calculateAnnualizedReturn(fiveYearReturn, actualFiveYearPeriod) : null,
          fiveYearTotal: fiveYearReturn
        }
      });
    }

    // Portfolio-level returns (quarterly rebalanced)
    const portfolioReturns = {
      oneYear: oneYearAnnualized,
      oneYearTotal: oneYearTotalReturn,
      twoYear: twoYearAnnualized,
      twoYearTotal: twoYearTotalReturn,
      threeYear: threeYearAnnualized,
      threeYearTotal: threeYearTotalReturn,
      fourYear: fourYearAnnualized,
      fourYearTotal: fourYearTotalReturn,
      fiveYear: fiveYearAnnualized,
      fiveYearTotal: fiveYearTotalReturn,
      validStocks: {
        oneYear: stockReturns.filter(s => s.returns.oneYear !== null).length,
        twoYear: stockReturns.filter(s => s.returns.twoYear !== null).length,
        threeYear: stockReturns.filter(s => s.returns.threeYear !== null).length,
        fourYear: stockReturns.filter(s => s.returns.fourYear !== null).length,
        fiveYear: stockReturns.filter(s => s.returns.fiveYear !== null).length
      }
    };

    return {
      portfolio: portfolioReturns,
      stocks: stockReturns,
      metadata: {
        totalStocks: symbols.length,
        calculatedDate: today.toISOString(),
        rebalancingStrategy: 'quarterly',
        periods: {
          oneYear: oneYearAgo.toISOString().split('T')[0],
          twoYear: twoYearsAgo.toISOString().split('T')[0],
          threeYear: threeYearsAgo.toISOString().split('T')[0],
          fourYear: fourYearsAgo.toISOString().split('T')[0],
          fiveYear: fiveYearsAgo.toISOString().split('T')[0]
        }
      }
    };
  }

  /**
   * Calculate annualized returns from total returns
   */
  calculateAnnualizedReturn(totalReturn, years) {
    if (!totalReturn || years <= 0) return null;

    // Convert percentage to decimal, calculate CAGR, convert back to percentage
    const decimal = totalReturn / 100;
    const cagr = (Math.pow(1 + decimal, 1 / years) - 1) * 100;
    return cagr;
  }
}

module.exports = new PortfolioReturnsService();
