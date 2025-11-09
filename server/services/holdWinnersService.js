/**
 * Hold Winners Service
 *
 * Portfolio strategy that holds onto winners (stocks still ranked in top 20)
 * and only replaces stocks that fall below rank #20:
 * - Each year, check current holdings against new top 20 ranking
 * - KEEP stocks from previous year if still ranked in top 20
 * - SELL stocks that fell below rank #20
 * - REPLACE sold stocks with new top-ranked stocks not currently held
 * - Maintain 10 stocks with equal weight at all times
 *
 * Example:
 * Year 5: Buy top 10 (NVDA #1, WMT #5, etc.)
 * Year 4: NVDA now #15 (keep), WMT now #30 (sell), AMZN new #1 (buy to replace WMT)
 */

const stockDataService = require('./stockDataService');
const evaluationService = require('./evaluationService');
const { getAllHistoricalFundamentals } = require('../database/db');

class HoldWinnersService {
  /**
   * Get ranked stocks from a specific year in the past
   * Returns ALL ranked stocks, not just top N
   */
  async getRankedStocksFromYear(yearsAgo, weights) {
    console.log(`\nGetting ranked stocks from ${yearsAgo} years ago...`);

    // Load historical fundamentals from database
    const cachedData = await getAllHistoricalFundamentals(yearsAgo);

    if (!cachedData || cachedData.length === 0) {
      throw new Error(`No historical data found for ${yearsAgo} years ago. Run fetch-all-historical-data.js first.`);
    }

    console.log(`Loaded ${cachedData.length} stocks from database`);

    // Set weights for evaluation
    evaluationService.setWeights(
      weights.marketCap / 100,
      weights.adtv / 100,
      weights.priceToSales / 100,
      weights.salesGrowth / 100,
      weights.gfScore / 100
    );

    // Evaluate and rank stocks
    const evaluated = evaluationService.evaluateStocks(cachedData);

    // Return stocks with their rankings
    return evaluated.map((stock, index) => ({
      symbol: stock.symbol,
      rank: index + 1,
      weightedScore: stock.weightedScore
    }));
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
   * Calculate returns using "hold winners" strategy
   *
   * @param {number} years - Number of years to backtest
   * @param {number} portfolioSize - Number of stocks to hold (typically 10)
   * @param {number} keepThreshold - Keep stocks ranked <= this (e.g., 20 for top 20)
   * @param {object} weights - Weight configuration for stock evaluation
   */
  async calculateHoldWinnersReturn(years, portfolioSize, keepThreshold, weights) {
    console.log(`\n========================================`);
    console.log(`HOLD WINNERS BACKTEST: ${years} YEARS`);
    console.log(`========================================`);
    console.log(`Strategy: Keep stocks in top ${keepThreshold}, replace others`);
    console.log(`Portfolio size: ${portfolioSize} stocks`);
    console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% P/S=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);

    const transactions = [];
    let portfolioValue = 1.0; // Start with $1
    let currentHoldings = []; // Array of {symbol, shares, rank}

    // For each year in the backtest period
    for (let yearOffset = years; yearOffset >= 0; yearOffset--) {
      const isLastYear = yearOffset === 0;
      const isFirstYear = yearOffset === years;

      // Calculate the date for this year
      const date = new Date();
      date.setFullYear(date.getFullYear() - yearOffset);
      const dateStr = date.toISOString().split('T')[0];

      if (isLastYear) {
        // Last year: sell everything and calculate final return
        console.log(`\n=== FINAL SELL (Year ${years + 1}: Today) ===`);

        const pricePromises = currentHoldings.map(h =>
          stockDataService.getHistoricalPrices(h.symbol, years + 1)
        );
        const pricesData = await Promise.all(pricePromises);

        let totalValue = 0;
        const sellDetails = [];

        for (let i = 0; i < currentHoldings.length; i++) {
          const holding = currentHoldings[i];
          const sellPrice = this.getPriceOnDate(pricesData[i], date);

          if (sellPrice) {
            const value = holding.shares * sellPrice;
            totalValue += value;

            sellDetails.push({
              symbol: holding.symbol,
              shares: holding.shares,
              sellPrice: sellPrice,
              value: value
            });
          }
        }

        portfolioValue = totalValue;

        transactions.push({
          date: dateStr,
          action: 'SELL_ALL',
          symbols: currentHoldings.map(h => h.symbol),
          count: currentHoldings.length,
          portfolioValue: portfolioValue,
          yearsAgo: yearOffset,
          sellDetails: sellDetails
        });

        console.log(`Sold all ${currentHoldings.length} stocks for $${portfolioValue.toFixed(4)}`);
        break;
      }

      // Get current year's rankings
      const rankedStocks = await this.getRankedStocksFromYear(yearOffset, weights);

      if (isFirstYear) {
        // First year: buy top N stocks
        console.log(`\n=== INITIAL BUY (Year 1: ${yearOffset}Y ago) ===`);

        const topStocks = rankedStocks.slice(0, portfolioSize);
        const symbolsToBuy = topStocks.map(s => s.symbol);

        // Fetch prices
        const pricePromises = symbolsToBuy.map(symbol =>
          stockDataService.getHistoricalPrices(symbol, years + 1)
        );
        const pricesData = await Promise.all(pricePromises);

        // Calculate shares for equal weight
        const cashPerStock = portfolioValue / portfolioSize;
        currentHoldings = [];

        for (let i = 0; i < symbolsToBuy.length; i++) {
          const buyPrice = this.getPriceOnDate(pricesData[i], date);
          if (buyPrice) {
            const shares = cashPerStock / buyPrice;
            currentHoldings.push({
              symbol: symbolsToBuy[i],
              shares: shares,
              buyPrice: buyPrice,
              rank: topStocks[i].rank
            });
          }
        }

        transactions.push({
          date: dateStr,
          action: 'BUY',
          symbols: symbolsToBuy,
          count: symbolsToBuy.length,
          portfolioValue: portfolioValue,
          yearsAgo: yearOffset,
          stockReturns: []
        });

        console.log(`Bought ${symbolsToBuy.length} stocks: ${symbolsToBuy.join(', ')}`);
      } else {
        // Subsequent years: hold winners, replace losers
        console.log(`\n=== REBALANCE (Year ${years - yearOffset + 1}: ${yearOffset}Y ago) ===`);

        // Special case: when keepThreshold equals portfolioSize, behave like annual rebalance
        // This ensures identical results to Annual Rebalance strategy
        if (keepThreshold === portfolioSize) {
          console.log(`  keepThreshold (${keepThreshold}) equals portfolioSize (${portfolioSize}) - using annual rebalance behavior`);

          // Sell all current holdings to get total cash
          const sellPricePromises = currentHoldings.map(h =>
            stockDataService.getHistoricalPrices(h.symbol, years + 1)
          );
          const sellPricesData = await Promise.all(sellPricePromises);

          let totalCash = 0;
          const stockReturns = [];

          for (let i = 0; i < currentHoldings.length; i++) {
            const holding = currentHoldings[i];
            const sellPrice = this.getPriceOnDate(sellPricesData[i], date);

            if (sellPrice) {
              const saleValue = holding.shares * sellPrice;
              totalCash += saleValue;

              const buyPrice = holding.buyPrice || 0;
              const stockReturn = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0;

              stockReturns.push({
                symbol: holding.symbol,
                buyPrice: buyPrice,
                sellPrice: sellPrice,
                return: stockReturn
              });
            }
          }

          console.log(`  Sold all ${currentHoldings.length} stocks for $${totalCash.toFixed(4)}`);

          // Buy top N stocks with equal weight
          const topStocks = rankedStocks.slice(0, portfolioSize);
          const symbolsToBuy = topStocks.map(s => s.symbol);

          const buyPricePromises = symbolsToBuy.map(symbol =>
            stockDataService.getHistoricalPrices(symbol, years + 1)
          );
          const buyPricesData = await Promise.all(buyPricePromises);

          const cashPerStock = totalCash / portfolioSize;
          currentHoldings = [];

          for (let i = 0; i < symbolsToBuy.length; i++) {
            const buyPrice = this.getPriceOnDate(buyPricesData[i], date);
            if (buyPrice) {
              const shares = cashPerStock / buyPrice;
              currentHoldings.push({
                symbol: symbolsToBuy[i],
                shares: shares,
                buyPrice: buyPrice,
                rank: topStocks[i].rank
              });
            }
          }

          console.log(`  Bought ${currentHoldings.length} new stocks: ${symbolsToBuy.join(', ')}`);

          // Record transaction
          transactions.push({
            date: dateStr,
            action: 'SELL_ALL',
            symbols: stockReturns.map(s => s.symbol),
            count: stockReturns.length,
            portfolioValue: totalCash,
            yearsAgo: yearOffset,
            stockReturns: stockReturns
          });

          transactions.push({
            date: dateStr,
            action: 'BUY',
            symbols: symbolsToBuy,
            count: symbolsToBuy.length,
            portfolioValue: totalCash,
            yearsAgo: yearOffset,
            stockReturns: []
          });

          portfolioValue = totalCash;
          console.log(`Portfolio value: $${portfolioValue.toFixed(4)}`);
          continue; // Skip the normal Hold Winners logic
        }

        // Create a map of current rankings
        const rankingMap = new Map(rankedStocks.map(s => [s.symbol, s.rank]));
        console.log(`DEBUG: rankedStocks has ${rankedStocks.length} stocks, top 10:`, rankedStocks.slice(0, 10).map(s => `${s.symbol}(#${s.rank})`).join(', '));
        console.log(`DEBUG: currentHoldings:`, currentHoldings.map(h => h.symbol).join(', '));

        // Determine which stocks to keep and which to sell
        const toKeep = [];
        const toSell = [];

        for (const holding of currentHoldings) {
          const currentRank = rankingMap.get(holding.symbol);
          if (currentRank && currentRank <= keepThreshold) {
            toKeep.push({...holding, currentRank});
            console.log(`  KEEP ${holding.symbol} (rank ${currentRank})`);
          } else {
            toSell.push(holding);
            console.log(`  SELL ${holding.symbol} (rank ${currentRank || 'unranked'})`);
          }
        }

        // Calculate value from sold stocks
        let cashFromSales = 0;
        if (toSell.length > 0) {
          const sellPricePromises = toSell.map(h =>
            stockDataService.getHistoricalPrices(h.symbol, years + 1)
          );
          const sellPricesData = await Promise.all(sellPricePromises);

          for (let i = 0; i < toSell.length; i++) {
            const sellPrice = this.getPriceOnDate(sellPricesData[i], date);
            if (sellPrice) {
              cashFromSales += toSell[i].shares * sellPrice;
            }
          }
        }

        // Find replacement stocks (top ranked stocks not currently held)
        const needToBuy = portfolioSize - toKeep.length;
        const currentSymbols = new Set(toKeep.map(h => h.symbol));
        const replacements = rankedStocks
          .filter(s => !currentSymbols.has(s.symbol))
          .slice(0, needToBuy);

        console.log(`  Need to buy ${needToBuy} stocks to maintain ${portfolioSize} positions`);

        // Buy replacement stocks with equal weight using cash from sales
        const newHoldings = [];
        if (replacements.length > 0) {
          const cashPerStock = cashFromSales / replacements.length;
          const replacementSymbols = replacements.map(s => s.symbol);

          const buyPricePromises = replacementSymbols.map(symbol =>
            stockDataService.getHistoricalPrices(symbol, years + 1)
          );
          const buyPricesData = await Promise.all(buyPricePromises);

          for (let i = 0; i < replacementSymbols.length; i++) {
            const buyPrice = this.getPriceOnDate(buyPricesData[i], date);
            if (buyPrice) {
              const shares = cashPerStock / buyPrice;
              newHoldings.push({
                symbol: replacementSymbols[i],
                shares: shares,
                buyPrice: buyPrice,
                rank: replacements[i].rank
              });
              console.log(`  BUY ${replacementSymbols[i]} (rank ${replacements[i].rank})`);
            }
          }
        }

        // Update portfolio
        currentHoldings = [...toKeep, ...newHoldings];

        // Calculate current portfolio value
        const valuePricePromises = currentHoldings.map(h =>
          stockDataService.getHistoricalPrices(h.symbol, years + 1)
        );
        const valuePricesData = await Promise.all(valuePricePromises);

        let totalValue = 0;
        for (let i = 0; i < currentHoldings.length; i++) {
          const price = this.getPriceOnDate(valuePricesData[i], date);
          if (price) {
            totalValue += currentHoldings[i].shares * price;
          }
        }

        portfolioValue = totalValue;

        transactions.push({
          date: dateStr,
          action: toSell.length > 0 ? 'REBALANCE' : 'HOLD',
          kept: toKeep.map(h => h.symbol),
          sold: toSell.map(h => h.symbol),
          bought: newHoldings.map(h => h.symbol),
          symbols: currentHoldings.map(h => h.symbol),
          count: currentHoldings.length,
          portfolioValue: portfolioValue,
          yearsAgo: yearOffset
        });

        console.log(`Portfolio value: $${portfolioValue.toFixed(4)}`);
      }
    }

    // Calculate total and annualized returns
    const totalReturn = (portfolioValue - 1.0) * 100;
    const annualizedReturn = (Math.pow(portfolioValue, 1 / years) - 1) * 100;

    return {
      totalReturn,
      annualizedReturn,
      finalValue: portfolioValue,
      transactions,
      years
    };
  }

  /**
   * Run hold winners backtest for multiple time periods
   */
  async runBacktest(portfolioSize = 10, keepThreshold = 20, weights) {
    const periods = [1, 2, 3, 4, 5];
    const results = {};
    const summary = {};

    for (const years of periods) {
      try {
        const result = await this.calculateHoldWinnersReturn(years, portfolioSize, keepThreshold, weights);
        results[`${years}year`] = result;
        summary[`${years}year`] = result.annualizedReturn;
      } catch (error) {
        console.error(`Error calculating ${years}-year hold winners return:`, error.message);
        results[`${years}year`] = null;
        summary[`${years}year`] = null;
      }
    }

    return { results, summary };
  }
}

module.exports = new HoldWinnersService();
