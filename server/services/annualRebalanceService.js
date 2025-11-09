/**
 * Annual Rebalance Service
 *
 * Calculates returns using annual rebalancing with complete portfolio turnover:
 * - Each year, sell ALL holdings
 * - Buy the NEW top 10 stocks for that year (equal weight)
 * - Repeat annually until today
 *
 * Example for 5-year return:
 * - Year 0 (5Y ago): Buy top 10 from 5Y ago (equal weight)
 * - Year 1 (4Y ago): Sell all, buy top 10 from 4Y ago (equal weight)
 * - Year 2 (3Y ago): Sell all, buy top 10 from 3Y ago (equal weight)
 * - Year 3 (2Y ago): Sell all, buy top 10 from 2Y ago (equal weight)
 * - Year 4 (1Y ago): Sell all, buy top 10 from 1Y ago (equal weight)
 * - Year 5 (today): Sell all, calculate total return
 */

const stockDataService = require('./stockDataService');
const evaluationService = require('./evaluationService');
const { getAllHistoricalFundamentals, getHistoricalDataCount } = require('../database/db');
const { SP500_TICKERS } = require('../config/sp500-tickers');

class AnnualRebalanceService {
  /**
   * Get top N stocks from a specific year in the past
   * Uses cached historical data from database
   */
  async getTopStocksFromYear(yearsAgo, topN, weights) {
    console.log(`\nGetting top ${topN} stocks from ${yearsAgo} years ago...`);

    // Load historical fundamentals from database
    const cachedData = await getAllHistoricalFundamentals(yearsAgo);

    if (!cachedData || cachedData.length === 0) {
      throw new Error(`No historical data found for ${yearsAgo} years ago. Run fetch-all-historical-data.js first.`);
    }

    console.log(`Loaded ${cachedData.length} stocks from database`);

    // Set weights for evaluation (convert from percentage to decimal)
    evaluationService.setWeights(
      weights.marketCap / 100,
      weights.adtv / 100,
      weights.priceToSales / 100,
      weights.salesGrowth / 100,
      weights.gfScore / 100
    );

    // Evaluate and rank stocks using the same scoring system
    const evaluated = evaluationService.evaluateStocks(cachedData);

    // Take top N stocks
    const topStocks = evaluated.slice(0, topN);

    console.log(`Top ${topN} stocks from ${yearsAgo}Y ago:`, topStocks.map(s => s.symbol).join(', '));

    return topStocks.map(s => s.symbol);
  }

  /**
   * Get price for a stock at a specific date
   */
  getPriceOnDate(historicalData, targetDate) {
    if (!historicalData || !historicalData.prices) {
      return null;
    }

    const target = new Date(targetDate);
    let closestPrice = null;
    let closestDiff = Infinity;

    for (const priceData of historicalData.prices) {
      const priceDate = new Date(priceData.date);
      const diff = Math.abs(target - priceDate);

      if (diff < closestDiff) {
        closestDiff = diff;
        closestPrice = priceData.adjClose;
      }
    }

    return closestPrice;
  }

  /**
   * Calculate annual rebalanced returns for a specific time period
   *
   * @param {number} years - Number of years to backtest (e.g., 5 for 5-year return)
   * @param {number} topN - Number of stocks to hold (e.g., 10)
   * @param {object} weights - Weight configuration for stock evaluation
   * @returns {object} - Return data including total return, annualized return, and transactions
   */
  async calculateAnnualRebalancedReturn(years, topN, weights) {
    console.log(`\n========================================`);
    console.log(`ANNUAL REBALANCE BACKTEST: ${years} YEARS`);
    console.log(`========================================`);
    console.log(`Strategy: Sell all & buy top ${topN} stocks each year`);
    console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% P/S=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);

    const transactions = [];
    let portfolioValue = 1.0; // Start with $1

    // For each year in the backtest period
    for (let yearOffset = years; yearOffset >= 0; yearOffset--) {
      const isLastYear = yearOffset === 0;
      const isFirstYear = yearOffset === years;

      // Calculate the date for this year
      const date = new Date();
      date.setFullYear(date.getFullYear() - yearOffset);
      const dateStr = date.toISOString().split('T')[0];

      // If not the last year, buy new holdings
      if (!isLastYear) {
        // Get top stocks for this year
        const topStocks = await this.getTopStocksFromYear(yearOffset, topN, weights);

        if (topStocks.length === 0) {
          throw new Error(`No stocks found for ${yearOffset} years ago`);
        }

        const buyTransaction = {
          date: dateStr,
          action: 'BUY',
          symbols: topStocks,
          count: topStocks.length,
          weightPerStock: 1.0 / topStocks.length,
          portfolioValue: portfolioValue,
          yearsAgo: yearOffset,
          stockReturns: [] // Will be populated after we calculate returns
        };

        transactions.push(buyTransaction);

        // Fetch historical prices for the current and next rebalance date
        const nextDate = new Date();
        nextDate.setFullYear(nextDate.getFullYear() - (yearOffset - 1));

        console.log(`\nYear ${years - yearOffset + 1}: ${yearOffset}Y ago -> ${yearOffset - 1}Y ago`);
        console.log(`Holding ${topStocks.length} stocks from ${dateStr}`);

        // Calculate returns for this holding period
        const pricePromises = topStocks.map(symbol =>
          stockDataService.getHistoricalPrices(symbol, years + 1)
        );

        const pricesData = await Promise.all(pricePromises);

        let periodReturn = 0;
        let validStocks = 0;
        const weightPerStock = 1.0 / topStocks.length;
        const stockReturns = []; // Track individual stock returns

        for (let i = 0; i < topStocks.length; i++) {
          const symbol = topStocks[i];
          const priceData = pricesData[i];

          if (!priceData) {
            console.log(`  ${symbol}: No price data`);
            stockReturns.push({
              symbol,
              buyPrice: null,
              sellPrice: null,
              return: null
            });
            continue;
          }

          const buyPrice = this.getPriceOnDate(priceData, date);
          const sellPrice = this.getPriceOnDate(priceData, nextDate);

          if (!buyPrice || !sellPrice) {
            console.log(`  ${symbol}: Missing prices (buy=${buyPrice}, sell=${sellPrice})`);
            stockReturns.push({
              symbol,
              buyPrice: buyPrice || null,
              sellPrice: sellPrice || null,
              return: null
            });
            continue;
          }

          const stockReturn = (sellPrice - buyPrice) / buyPrice;
          periodReturn += stockReturn * weightPerStock;
          validStocks++;

          stockReturns.push({
            symbol,
            buyPrice,
            sellPrice,
            return: stockReturn * 100 // Store as percentage
          });

          console.log(`  ${symbol}: $${buyPrice.toFixed(2)} -> $${sellPrice.toFixed(2)} = ${(stockReturn * 100).toFixed(1)}%`);
        }

        if (validStocks > 0) {
          portfolioValue *= (1 + periodReturn);
          console.log(`Portfolio value after year: $${portfolioValue.toFixed(4)} (${(periodReturn * 100).toFixed(2)}% return)`);
        } else {
          console.log(`Warning: No valid stocks for this period`);
        }

        // Update the BUY transaction with stock returns
        buyTransaction.stockReturns = stockReturns;

        // Add SELL_ALL transaction after holding period
        transactions.push({
          date: nextDate.toISOString().split('T')[0],
          action: 'SELL_ALL',
          portfolioValue: portfolioValue,
          yearsAgo: yearOffset - 1
        });
      }
    }

    // Calculate total and annualized returns
    const totalReturn = (portfolioValue - 1.0) * 100;
    const annualizedReturn = years > 0
      ? (Math.pow(portfolioValue, 1 / years) - 1) * 100
      : totalReturn;

    console.log(`\n========================================`);
    console.log(`FINAL RESULTS`);
    console.log(`========================================`);
    console.log(`Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`Annualized Return: ${annualizedReturn.toFixed(2)}%`);
    console.log(`Final Portfolio Value: $${portfolioValue.toFixed(4)}`);

    return {
      totalReturn,
      annualizedReturn,
      finalValue: portfolioValue,
      years,
      transactions,
      metadata: {
        strategy: 'annual_rebalance',
        topN,
        weights,
        calculatedDate: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate returns for multiple time periods (1Y, 2Y, 3Y, 4Y, 5Y)
   */
  async calculateAllPeriods(topN, weights) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ANNUAL REBALANCE BACKTEST - ALL PERIODS`);
    console.log(`${'='.repeat(80)}`);

    const results = {};

    // Calculate for each period
    for (const years of [1, 2, 3, 4, 5]) {
      try {
        console.log(`\n\nCalculating ${years}-year return...`);
        results[`${years}year`] = await this.calculateAnnualRebalancedReturn(years, topN, weights);
      } catch (error) {
        console.error(`Error calculating ${years}-year return:`, error.message);
        results[`${years}year`] = {
          error: error.message,
          totalReturn: null,
          annualizedReturn: null
        };
      }
    }

    return {
      results,
      summary: {
        '1year': results['1year']?.totalReturn || null,
        '2year': results['2year']?.annualizedReturn || null,
        '3year': results['3year']?.annualizedReturn || null,
        '4year': results['4year']?.annualizedReturn || null,
        '5year': results['5year']?.annualizedReturn || null
      }
    };
  }
}

module.exports = new AnnualRebalanceService();
