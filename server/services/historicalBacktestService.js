/**
 * Historical Backtest Service
 *
 * Performs true historical backtesting by:
 * 1. Fetching historical fundamental data (MC, ADTV, P/S, Sales Growth) from specific past dates
 * 2. Ranking stocks based on those historical fundamentals
 * 3. Selecting top N stocks from that historical ranking
 * 4. Calculating returns from the historical selection date to today
 */

const stockDataService = require('./stockDataService');
const evaluationService = require('./evaluationService');
const portfolioReturnsService = require('./portfolioReturnsService');
const { SP500_TICKERS } = require('../config/sp500-tickers');

class HistoricalBacktestService {
  /**
   * Get historical fundamentals for all S&P 500 stocks at a specific point in time
   */
  async getHistoricalStockData(yearsAgo) {
    console.log(`Fetching historical fundamentals for S&P 500 stocks from ${yearsAgo} years ago...`);

    const batchSize = 10;
    const delay = 2000; // 2 second delay between batches
    const results = [];

    for (let i = 0; i < SP500_TICKERS.length; i += batchSize) {
      const batch = SP500_TICKERS.slice(i, i + batchSize);

      const batchPromises = batch.map(symbol =>
        stockDataService.getHistoricalFundamentals(symbol, yearsAgo)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      console.log(`Processed ${Math.min(i + batchSize, SP500_TICKERS.length)}/${SP500_TICKERS.length} stocks for ${yearsAgo}Y backtest`);

      // Wait before next batch (except for last batch)
      if (i + batchSize < SP500_TICKERS.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Perform historical backtest:
   * 1. Get historical fundamentals from N years ago
   * 2. Rank stocks using those historical fundamentals
   * 3. Get top N stocks from that historical ranking
   * 4. Calculate returns from selection date to today
   */
  async performBacktest(yearsAgo, topN = 10, weights = null) {
    console.log(`\n=== Starting Historical Backtest: ${yearsAgo} Years Ago ===`);

    // Get historical fundamentals for all S&P 500 stocks
    const historicalStocks = await this.getHistoricalStockData(yearsAgo);

    if (historicalStocks.length === 0) {
      throw new Error(`No historical data available for ${yearsAgo} years ago`);
    }

    console.log(`Got historical data for ${historicalStocks.length} stocks`);

    // Apply custom weights if provided
    if (weights) {
      evaluationService.setWeights(
        weights.marketCap,
        weights.adtv,
        weights.priceToSales,
        weights.salesGrowth
      );
    }

    // Rank stocks using historical fundamentals
    const rankedStocks = evaluationService.evaluateStocks(historicalStocks);
    console.log(`Ranked stocks using historical fundamentals`);

    // Reset weights to default
    if (weights) {
      evaluationService.resetWeights();
    }

    // Get top N stocks from historical ranking
    const topStocks = rankedStocks.slice(0, topN);
    const symbols = topStocks.map(s => s.symbol);

    console.log(`Top ${topN} stocks from ${yearsAgo} years ago:`, symbols.join(', '));

    // Calculate returns from the historical date to today
    const selectionDate = new Date();
    selectionDate.setFullYear(selectionDate.getFullYear() - yearsAgo);

    const returns = await this.calculateBacktestReturns(symbols, yearsAgo);

    return {
      yearsAgo: yearsAgo,
      selectionDate: selectionDate.toISOString().split('T')[0],
      topStocks: topStocks.map(s => ({
        symbol: s.symbol,
        historicalRank: s.overallRank,
        historicalMetrics: {
          marketCap: s.marketCap,
          adtv: s.adtv,
          priceToSales: s.priceToSales,
          salesGrowth: s.salesGrowth
        }
      })),
      returns: returns,
      weights: weights || { marketCap: 25, adtv: 25, priceToSales: 25, salesGrowth: 25 }
    };
  }

  /**
   * Calculate returns for a historical portfolio
   * from the selection date (yearsAgo) to today
   */
  async calculateBacktestReturns(symbols, yearsAgo) {
    console.log(`Calculating backtest returns for ${symbols.length} stocks over ${yearsAgo} years...`);

    // Fetch historical price data for all symbols
    const historicalDataPromises = symbols.map(symbol =>
      stockDataService.getHistoricalPrices(symbol, yearsAgo + 1) // Get extra data for safety
    );

    const historicalDataArray = await Promise.all(historicalDataPromises);

    // Calculate dates
    const today = new Date();
    const selectionDate = new Date(today);
    selectionDate.setFullYear(today.getFullYear() - yearsAgo);

    // Calculate returns for each stock from selection date to today
    const stockReturns = [];
    const weight = 100 / symbols.length; // Equal weight percentage

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const historicalData = historicalDataArray[i];

      if (!historicalData || !historicalData.prices) {
        console.log(`No historical data for ${symbol}, skipping...`);
        continue;
      }

      // Get current price (most recent)
      const currentPrice = historicalData.prices[0]?.adjClose;
      const currentDate = historicalData.prices[0]?.date;

      // Get price at selection date
      const selectionPriceData = portfolioReturnsService.getPriceOnDate(historicalData, selectionDate);

      if (!selectionPriceData || !currentPrice) {
        console.log(`Missing price data for ${symbol}, skipping...`);
        continue;
      }

      // Calculate total return from selection date to today
      const totalReturn = portfolioReturnsService.calculateReturn(selectionPriceData.price, currentPrice);

      // Calculate actual time period in years
      const actualPeriod = (new Date(currentDate) - new Date(selectionPriceData.date)) / (365.25 * 24 * 60 * 60 * 1000);

      // Calculate annualized return
      const annualizedReturn = totalReturn !== null
        ? portfolioReturnsService.calculateAnnualizedReturn(totalReturn, actualPeriod)
        : null;

      stockReturns.push({
        symbol: symbol,
        weight: weight,
        selectionPrice: selectionPriceData.price,
        selectionDate: selectionPriceData.date,
        currentPrice: currentPrice,
        returns: {
          total: totalReturn,
          annualized: annualizedReturn
        }
      });
    }

    // Calculate portfolio-level returns (weighted average)
    let portfolioTotalReturn = 0;
    let portfolioAnnualizedReturn = 0;
    let validStocks = 0;

    stockReturns.forEach(stock => {
      if (stock.returns.total !== null) {
        portfolioTotalReturn += stock.returns.total * (stock.weight / 100);
        portfolioAnnualizedReturn += stock.returns.annualized * (stock.weight / 100);
        validStocks++;
      }
    });

    return {
      portfolio: {
        totalReturn: portfolioTotalReturn,
        annualizedReturn: portfolioAnnualizedReturn,
        validStocks: validStocks
      },
      stocks: stockReturns,
      metadata: {
        totalStocks: symbols.length,
        period: yearsAgo,
        selectionDate: selectionDate.toISOString().split('T')[0],
        calculatedDate: today.toISOString()
      }
    };
  }
}

module.exports = new HistoricalBacktestService();
