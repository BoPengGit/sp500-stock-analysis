/**
 * Rolling Rebalance Backtest Service
 *
 * Performs annual rebalancing backtest:
 * 1. Start 5 years ago: Rank stocks → Select Top N
 * 2. Hold for 1 year
 * 3. Re-rank stocks 4 years ago → Select new Top N → Track buy/sell transactions
 * 4. Repeat annually until today
 * 5. Calculate returns and show all transactions
 */

const stockDataService = require('./stockDataService');
const evaluationService = require('./evaluationService');
const portfolioReturnsService = require('./portfolioReturnsService');
const { SP500_TICKERS } = require('../config/sp500-tickers');
const { getAllHistoricalFundamentals, getHistoricalDataCount } = require('../database/db');

class RollingRebalanceBacktestService {
  /**
   * Get historical fundamentals for all S&P 500 stocks at a specific point in time
   * First tries to load from database cache, then falls back to API calls
   */
  async getHistoricalStockData(yearsAgo) {
    console.log(`\nFetching historical fundamentals from ${yearsAgo} years ago...`);

    // Try to load from database first
    const cachedCount = await getHistoricalDataCount(yearsAgo);
    console.log(`Found ${cachedCount}/${SP500_TICKERS.length} stocks in database cache`);

    if (cachedCount >= SP500_TICKERS.length * 0.9) { // If we have 90% or more, use cache
      console.log(`Using cached data from database...`);
      const cachedData = await getAllHistoricalFundamentals(yearsAgo);

      // Convert database format to service format
      const results = cachedData.map(row => ({
        symbol: row.symbol,
        marketCap: row.marketCap,
        adtv: row.adtv,
        priceToSales: row.priceToSales,
        salesGrowth: row.salesGrowth,
        gfScore: row.gfScore,
        date: row.date
      }));

      console.log(`Loaded ${results.length} stocks from database cache`);
      return results;
    }

    // Otherwise, fetch from API
    console.log(`Cache incomplete, fetching from API...`);

    const batchSize = 50; // With 300 calls/min, we can do larger batches
    const delay = 10000; // 10 second delay between batches (50 stocks = ~200 API calls)
    const results = [];

    for (let i = 0; i < SP500_TICKERS.length; i += batchSize) {
      const batch = SP500_TICKERS.slice(i, i + batchSize);

      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(SP500_TICKERS.length/batchSize)} (${batch.length} stocks)...`);

      const batchPromises = batch.map(symbol =>
        stockDataService.getHistoricalFundamentals(symbol, yearsAgo)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      console.log(`Progress: ${Math.min(i + batchSize, SP500_TICKERS.length)}/${SP500_TICKERS.length} stocks processed for ${yearsAgo}Y`);

      // Wait before next batch (except for last batch)
      if (i + batchSize < SP500_TICKERS.length) {
        console.log(`Waiting 10 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Perform rolling rebalancing backtest over multiple years
   * @param {number} startYearsAgo - How many years ago to start (e.g., 5)
   * @param {number} topN - Number of stocks to hold (e.g., 10)
   * @param {object} weights - Ranking weights {marketCap, adtv, priceToSales, salesGrowth, gfScore}
   */
  async performRollingBacktest(startYearsAgo = 5, topN = 10, weights = null) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ROLLING REBALANCING BACKTEST: ${startYearsAgo} Years, Top ${topN} Stocks`);
    console.log(`${'='.repeat(80)}`);

    const today = new Date();
    const rebalanceDates = [];
    const portfolioSnapshots = [];
    const transactions = [];
    let currentHoldings = [];

    // Generate annual rebalancing dates
    for (let year = startYearsAgo; year >= 0; year--) {
      const date = new Date(today);
      date.setFullYear(today.getFullYear() - year);
      rebalanceDates.push({
        yearsAgo: year,
        date: date,
        dateStr: date.toISOString().split('T')[0]
      });
    }

    console.log(`\nRebalancing Schedule (${rebalanceDates.length} periods):`);
    rebalanceDates.forEach((r, i) => {
      console.log(`  Period ${i}: ${r.dateStr} (${r.yearsAgo}Y ago)`);
    });

    // For each rebalancing period
    for (let i = 0; i < rebalanceDates.length - 1; i++) {
      const periodStart = rebalanceDates[i];
      const periodEnd = rebalanceDates[i + 1];

      console.log(`\n${'='.repeat(80)}`);
      console.log(`PERIOD ${i + 1}: ${periodStart.dateStr} → ${periodEnd.dateStr}`);
      console.log(`${'='.repeat(80)}`);

      // Step 1: Get historical fundamentals for ranking
      const historicalStocks = await this.getHistoricalStockData(periodStart.yearsAgo);

      if (historicalStocks.length === 0) {
        console.error(`No historical data available for ${periodStart.yearsAgo}Y ago`);
        continue;
      }

      console.log(`Retrieved fundamentals for ${historicalStocks.length} stocks`);

      // Step 2: Apply custom weights if provided
      if (weights) {
        evaluationService.setWeights(
          weights.marketCap,
          weights.adtv,
          weights.priceToSales,
          weights.salesGrowth,
          weights.gfScore || 0
        );
      }

      // Step 3: Rank stocks using historical fundamentals
      const rankedStocks = evaluationService.evaluateStocks(historicalStocks);

      // Reset weights
      if (weights) {
        evaluationService.resetWeights();
      }

      // Step 4: Select top N stocks
      const topStocks = rankedStocks.slice(0, topN);
      const newHoldings = topStocks.map(s => s.symbol);

      console.log(`\nTop ${topN} stocks selected:`, newHoldings.join(', '));

      // Step 5: Compare with previous holdings to determine buy/sell transactions
      if (i > 0) {
        const sells = currentHoldings.filter(symbol => !newHoldings.includes(symbol));
        const buys = newHoldings.filter(symbol => !currentHoldings.includes(symbol));

        console.log(`\nRebalancing Transactions:`);
        if (sells.length > 0) {
          console.log(`  SELL: ${sells.join(', ')}`);
        }
        if (buys.length > 0) {
          console.log(`  BUY:  ${buys.join(', ')}`);
        }

        transactions.push({
          date: periodStart.dateStr,
          yearsAgo: periodStart.yearsAgo,
          sells: sells,
          buys: buys,
          holdings: newHoldings
        });
      } else {
        // Initial purchase
        console.log(`\nInitial Purchase: ${newHoldings.join(', ')}`);
        transactions.push({
          date: periodStart.dateStr,
          yearsAgo: periodStart.yearsAgo,
          sells: [],
          buys: newHoldings,
          holdings: newHoldings
        });
      }

      // Update current holdings
      currentHoldings = newHoldings;

      // Step 6: Calculate returns for this period
      console.log(`\nCalculating returns from ${periodStart.dateStr} to ${periodEnd.dateStr}...`);

      // Fetch historical price data for the holdings
      const historicalDataPromises = currentHoldings.map(symbol =>
        stockDataService.getHistoricalPrices(symbol, startYearsAgo + 1) // Fetch enough history
      );

      const historicalDataArray = await Promise.all(historicalDataPromises);

      // Calculate equal-weighted return for this period
      const periodReturn = portfolioReturnsService.calculateQuarterlyRebalancedReturn(
        historicalDataArray,
        currentHoldings,
        periodStart.date,
        periodEnd.date
      );

      console.log(`Period Return: ${periodReturn !== null ? periodReturn.toFixed(2) + '%' : 'N/A'}`);

      portfolioSnapshots.push({
        periodNumber: i + 1,
        startDate: periodStart.dateStr,
        endDate: periodEnd.dateStr,
        holdings: currentHoldings,
        periodReturn: periodReturn,
        holdingsCount: currentHoldings.length
      });
    }

    // Calculate cumulative returns
    let cumulativeReturn = 1.0;
    for (const snapshot of portfolioSnapshots) {
      if (snapshot.periodReturn !== null) {
        cumulativeReturn *= (1 + snapshot.periodReturn / 100);
      }
    }

    const totalReturn = (cumulativeReturn - 1) * 100;
    const years = startYearsAgo;
    const annualizedReturn = years > 0
      ? (Math.pow(cumulativeReturn, 1 / years) - 1) * 100
      : null;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`FINAL RESULTS`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`Annualized Return: ${annualizedReturn !== null ? annualizedReturn.toFixed(2) + '%' : 'N/A'}`);
    console.log(`Total Periods: ${portfolioSnapshots.length}`);
    console.log(`Total Transactions: ${transactions.length}`);

    return {
      startYearsAgo: startYearsAgo,
      topN: topN,
      weights: weights || { marketCap: 25, adtv: 25, priceToSales: 25, salesGrowth: 25, gfScore: 0 },
      totalReturn: totalReturn,
      annualizedReturn: annualizedReturn,
      periods: portfolioSnapshots,
      transactions: transactions,
      finalHoldings: currentHoldings,
      summary: {
        startDate: rebalanceDates[0].dateStr,
        endDate: rebalanceDates[rebalanceDates.length - 1].dateStr,
        numberOfPeriods: portfolioSnapshots.length,
        numberOfRebalances: transactions.length - 1, // Exclude initial purchase
        totalBuys: transactions.reduce((sum, t) => sum + t.buys.length, 0),
        totalSells: transactions.reduce((sum, t) => sum + t.sells.length, 0)
      }
    };
  }
}

module.exports = new RollingRebalanceBacktestService();
