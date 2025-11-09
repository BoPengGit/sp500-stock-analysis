const express = require('express');
const router = express.Router();
const stockDataService = require('../services/stockDataService');
const webScraperService = require('../services/webScraperService');
const evaluationService = require('../services/evaluationService');
const portfolioReturnsService = require('../services/portfolioReturnsService');
const historicalBacktestService = require('../services/historicalBacktestService');
const rollingRebalanceBacktestService = require('../services/rollingRebalanceBacktestService');
const annualRebalanceService = require('../services/annualRebalanceService');
const holdWinnersService = require('../services/holdWinnersService');
const guruFocusService = require('../services/guruFocusService');
const garpService = require('../services/garpService');
const { SP500_TICKERS } = require('../config/sp500-tickers');
const {
  getStocksFromDB,
  saveStocksToDB,
  getLastUpdateTime,
  savePortfolioReturns,
  getPortfolioReturns,
  getPortfolioReturnsUpdateTime,
  saveHistoricalBacktest,
  getHistoricalBacktest,
  getHistoricalBacktestUpdateTime,
  saveGFScores,
  getGFScores,
  getGFScoresUpdateTime,
  saveAnnualRebalanceReturns,
  getAnnualRebalanceReturns,
  getAnnualRebalanceReturnsUpdateTime,
  getAllHistoricalFundamentals
} = require('../database/db');

/**
 * GET /api/stocks/evaluate
 * Fetch and evaluate all S&P 500 stocks
 */
router.get('/evaluate', async (req, res) => {
  try {
    const { refresh, limit, sector, minMarketCap, marketCap, adtv, priceToSales, salesGrowth, gfScore, peRatio, debtToEquity, operatingMargin, roic, fcfYield } = req.query;

    // Parse weight parameters (if provided)
    const hasCustomWeights = marketCap !== undefined || adtv !== undefined || priceToSales !== undefined || salesGrowth !== undefined || gfScore !== undefined || peRatio !== undefined || debtToEquity !== undefined || operatingMargin !== undefined || roic !== undefined || fcfYield !== undefined;
    if (hasCustomWeights) {
      evaluationService.setWeights(
        marketCap !== undefined ? parseInt(marketCap) : 20,
        adtv !== undefined ? parseInt(adtv) : 20,
        priceToSales !== undefined ? parseInt(priceToSales) : 20,
        salesGrowth !== undefined ? parseInt(salesGrowth) : 20,
        gfScore !== undefined ? parseInt(gfScore) : 20,
        peRatio !== undefined ? parseInt(peRatio) : 0,
        debtToEquity !== undefined ? parseInt(debtToEquity) : 0,
        operatingMargin !== undefined ? parseInt(operatingMargin) : 0,
        roic !== undefined ? parseInt(roic) : 0,
        fcfYield !== undefined ? parseInt(fcfYield) : 0
      );
    }

    // Check if we should use cached data
    const lastUpdate = await getLastUpdateTime();
    const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity;
    const shouldRefresh = refresh === 'true' || cacheAge > 604800000; // Refresh if > 1 week (7 days)

    let stocks;

    if (shouldRefresh) {
      console.log('Fetching fresh stock data...');

      // Fetch stock data (FMP API or mock data)
      const useMockData = process.env.USE_MOCK_DATA === 'true';
      let stockData;

      // Always use stockDataService - it handles both mock and real FMP API data
      stockData = await stockDataService.batchFetchStocks(SP500_TICKERS);

      // Evaluate stocks
      const evaluated = evaluationService.evaluateStocks(stockData);

      // Save to database
      await saveStocksToDB(evaluated);

      stocks = evaluated;
    } else {
      console.log('Using cached stock data from database...');
      stocks = await getStocksFromDB();

      // Re-evaluate in case weights or logic changed
      if (stocks.length > 0) {
        stocks = evaluationService.evaluateStocks(stocks);
      }
    }

    // Reset weights to default after evaluation
    if (hasCustomWeights) {
      evaluationService.resetWeights();
    }

    // Apply filters
    let filteredStocks = stocks;

    if (sector) {
      filteredStocks = evaluationService.filterBySector(filteredStocks, sector);
    }

    if (minMarketCap) {
      filteredStocks = evaluationService.filterByMinMarketCap(
        filteredStocks,
        parseFloat(minMarketCap)
      );
    }

    // Apply limit
    const limitNum = limit ? parseInt(limit) : filteredStocks.length;
    const resultStocks = filteredStocks.slice(0, limitNum);

    res.json({
      success: true,
      data: resultStocks,
      metadata: {
        total: resultStocks.length,
        filtered: filteredStocks.length,
        totalAvailable: stocks.length,
        lastUpdate: await getLastUpdateTime(),
        filters: {
          sector: sector || null,
          minMarketCap: minMarketCap || null,
          limit: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Error evaluating stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate stocks',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/top/:n
 * Get top N ranked stocks
 */
router.get('/top/:n', async (req, res) => {
  try {
    const n = parseInt(req.params.n) || 10;
    const stocks = await getStocksFromDB();

    if (stocks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No stock data available. Please run /evaluate first.'
      });
    }

    const topStocks = evaluationService.getTopStocks(stocks, n);

    res.json({
      success: true,
      data: topStocks,
      metadata: {
        count: topStocks.length,
        lastUpdate: await getLastUpdateTime()
      }
    });
  } catch (error) {
    console.error('Error getting top stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get top stocks',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/statistics
 * Get statistics about evaluated stocks
 */
router.get('/statistics', async (req, res) => {
  try {
    const stocks = await getStocksFromDB();

    if (stocks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No stock data available. Please run /evaluate first.'
      });
    }

    const stats = evaluationService.getStatistics(stocks);

    res.json({
      success: true,
      data: stats,
      metadata: {
        lastUpdate: await getLastUpdateTime()
      }
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/search/:symbol
 * Get specific stock data
 */
router.get('/search/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const stocks = await getStocksFromDB();

    const stock = stocks.find(s => s.symbol === symbol);

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: `Stock ${symbol} not found`
      });
    }

    res.json({
      success: true,
      data: stock,
      metadata: {
        lastUpdate: await getLastUpdateTime()
      }
    });
  } catch (error) {
    console.error('Error searching for stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search for stock',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/sectors
 * Get list of all sectors
 */
router.get('/sectors', async (req, res) => {
  try {
    const stocks = await getStocksFromDB();

    if (stocks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No stock data available. Please run /evaluate first.'
      });
    }

    const sectors = [...new Set(
      stocks
        .map(s => s.additionalData?.sector)
        .filter(s => s)
    )].sort();

    res.json({
      success: true,
      data: sectors,
      metadata: {
        count: sectors.length
      }
    });
  } catch (error) {
    console.error('Error getting sectors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sectors',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/portfolio-returns
 * Calculate historical returns for an equal-weighted portfolio of top N stocks
 * Cached for 1 week
 */
router.get('/portfolio-returns', async (req, res) => {
  try {
    const {
      n = 10,
      refresh,
      marketCap,
      adtv,
      priceToSales,
      salesGrowth,
      gfScore
    } = req.query;
    const topN = parseInt(n);

    // Check if custom weights are provided
    const hasCustomWeights = marketCap !== undefined || adtv !== undefined || priceToSales !== undefined || salesGrowth !== undefined || gfScore !== undefined;
    const weights = hasCustomWeights ? {
      marketCap: marketCap !== undefined ? parseFloat(marketCap) : 20,
      adtv: adtv !== undefined ? parseFloat(adtv) : 20,
      priceToSales: priceToSales !== undefined ? parseFloat(priceToSales) : 20,
      salesGrowth: salesGrowth !== undefined ? parseFloat(salesGrowth) : 20,
      gfScore: gfScore !== undefined ? parseFloat(gfScore) : 20
    } : null;

    // Check if we should use cached data (only for default weights)
    const lastUpdate = !hasCustomWeights ? await getPortfolioReturnsUpdateTime(topN) : null;
    const shouldRefresh = hasCustomWeights || refresh === 'true'; // Only refresh if explicitly requested or custom weights

    let returns;

    if (shouldRefresh) {
      console.log(`Calculating fresh portfolio returns for top ${topN} stocks...`);
      if (weights) {
        console.log(`Using custom weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% PS=${weights.priceToSales}% SG=${weights.salesGrowth}%`);
      }

      // Get all stocks from database
      const stocks = await getStocksFromDB();

      if (stocks.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No stock data available. Please run /evaluate first.'
        });
      }

      // Apply custom weights if provided
      let topStocks;
      if (weights) {
        evaluationService.setWeights(weights.marketCap, weights.adtv, weights.priceToSales, weights.salesGrowth, weights.gfScore);
        const reranked = evaluationService.evaluateStocks(stocks);
        topStocks = evaluationService.getTopStocks(reranked, topN);
        evaluationService.resetWeights(); // Reset to default
      } else {
        topStocks = evaluationService.getTopStocks(stocks, topN);
      }

      const symbols = topStocks.map(s => s.symbol);

      // Calculate portfolio returns
      returns = await portfolioReturnsService.calculatePortfolioReturns(symbols);
      returns.weights = weights || { marketCap: 25, adtv: 25, priceToSales: 25, salesGrowth: 25 };

      // Save to database (only for default weights)
      if (!hasCustomWeights) {
        await savePortfolioReturns(topN, returns);
      }
    } else {
      console.log(`Using cached portfolio returns for top ${topN} stocks...`);
      const cached = await getPortfolioReturns(topN);
      if (cached && cached.data) {
        returns = cached.data;
      } else {
        // Cache miss - calculate fresh data
        console.log('Cache was empty, calculating fresh data...');

        // Get all stocks from database
        const stocks = await getStocksFromDB();

        if (stocks.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No stock data available. Please run /evaluate first.'
          });
        }

        // Get top N stocks using evaluation service
        const topStocks = evaluationService.getTopStocks(stocks, topN);
        const symbols = topStocks.map(s => s.symbol);
        returns = await portfolioReturnsService.calculatePortfolioReturns(symbols);
        returns.weights = weights || { marketCap: 25, adtv: 25, priceToSales: 25, salesGrowth: 25 };
        if (!hasCustomWeights) {
          await savePortfolioReturns(topN, returns);
        }
      }
    }

    res.json({
      success: true,
      data: returns,
      metadata: {
        topN: topN,
        calculatedAt: new Date().toISOString(),
        lastUpdate: await getPortfolioReturnsUpdateTime(topN)
      }
    });
  } catch (error) {
    console.error('Error calculating portfolio returns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate portfolio returns',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/historical-backtest
 * Perform historical backtesting using fundamentals from a specific past date
 * Ranks stocks based on historical metrics and calculates returns to today
 * Cached for 1 week
 */
router.get('/historical-backtest', async (req, res) => {
  try {
    const {
      yearsAgo = 1,
      n = 10,
      refresh,
      marketCap,
      adtv,
      priceToSales,
      salesGrowth
    } = req.query;

    const years = parseInt(yearsAgo);
    const topN = parseInt(n);

    // Check for custom weights
    const hasCustomWeights = marketCap || adtv || priceToSales || salesGrowth;
    const weights = hasCustomWeights ? {
      marketCap: parseFloat(marketCap) || 25,
      adtv: parseFloat(adtv) || 25,
      priceToSales: parseFloat(priceToSales) || 25,
      salesGrowth: parseFloat(salesGrowth) || 25
    } : { marketCap: 25, adtv: 25, priceToSales: 25, salesGrowth: 25 };

    console.log(`\n=== Historical Backtest Request ===`);
    console.log(`Years Ago: ${years}`);
    console.log(`Top N: ${topN}`);
    console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% PS=${weights.priceToSales}% SG=${weights.salesGrowth}%`);

    // Check if we should use cached data
    const lastUpdate = await getHistoricalBacktestUpdateTime(years, topN, weights);
    const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity;
    const shouldRefresh = refresh === 'true' || cacheAge > 604800000; // Refresh if > 1 week (7 days)

    let result;

    if (shouldRefresh) {
      console.log(`Performing fresh historical backtest for ${years}Y...`);

      // Perform historical backtest
      result = await historicalBacktestService.performBacktest(years, topN, weights);

      // Save to database
      await saveHistoricalBacktest(years, topN, weights, result);
    } else {
      console.log(`Using cached historical backtest for ${years}Y...`);
      const cached = await getHistoricalBacktest(years, topN, weights);
      result = cached.data;
    }

    res.json({
      success: true,
      data: result,
      metadata: {
        yearsAgo: years,
        topN: topN,
        calculatedAt: new Date().toISOString(),
        lastUpdate: await getHistoricalBacktestUpdateTime(years, topN, weights)
      }
    });
  } catch (error) {
    console.error('Error performing historical backtest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform historical backtest',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/gf-scores
 * Fetch GF Scores for all S&P 500 stocks from GuruFocus
 * Cached for 1 week
 */
router.get('/gf-scores', async (req, res) => {
  try {
    const { refresh } = req.query;

    // Check if we should use cached data
    const lastUpdate = await getGFScoresUpdateTime();
    const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity;
    const shouldRefresh = refresh === 'true' || cacheAge > 604800000; // Refresh if > 1 week (7 days)

    let scores;
    let scrapingResult;

    if (shouldRefresh) {
      console.log('Fetching fresh GF Scores for S&P 500 stocks...');

      // Fetch GF Scores for all S&P 500 stocks
      // The service now saves incrementally to database and returns a result object
      scrapingResult = await guruFocusService.batchFetchStockRankings(SP500_TICKERS);

      // Get all scores from database
      scores = await getGFScores();
    } else {
      console.log('Using cached GF Scores...');
      scores = await getGFScores();
    }

    res.json({
      success: true,
      data: scores,
      metadata: {
        total: scores.length,
        lastUpdate: await getGFScoresUpdateTime(),
        scrapingResult: scrapingResult || null
      }
    });
  } catch (error) {
    console.error('Error fetching GF Scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GF Scores',
      message: error.message
    });
  }
});

/**
 * GET /api/stocks/rolling-backtest
 * Perform rolling rebalancing backtest with annual rebalancing
 * Shows all buy/sell transactions across multiple years
 */
router.get('/rolling-backtest', async (req, res) => {
  try {
    const {
      years = 5,
      n = 10,
      marketCap,
      adtv,
      priceToSales,
      salesGrowth,
      gfScore
    } = req.query;

    const startYearsAgo = parseInt(years);
    const topN = parseInt(n);

    // Check for custom weights
    const hasCustomWeights = marketCap || adtv || priceToSales || salesGrowth || gfScore;
    const weights = hasCustomWeights ? {
      marketCap: parseFloat(marketCap) || 25,
      adtv: parseFloat(adtv) || 25,
      priceToSales: parseFloat(priceToSales) || 25,
      salesGrowth: parseFloat(salesGrowth) || 25,
      gfScore: parseFloat(gfScore) || 0
    } : null;

    console.log(`\n=== Rolling Backtest Request ===`);
    console.log(`Years: ${startYearsAgo}`);
    console.log(`Top N: ${topN}`);
    if (weights) {
      console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% PS=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);
    }

    // Perform rolling backtest
    const result = await rollingRebalanceBacktestService.performRollingBacktest(
      startYearsAgo,
      topN,
      weights
    );

    res.json({
      success: true,
      data: result,
      metadata: {
        calculatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error performing rolling backtest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform rolling backtest',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/stocks/historical-top-stocks
 * Get detailed stock data for top N stocks from a specific year in the past
 */
router.get('/historical-top-stocks', async (req, res) => {
  try {
    const { yearsAgo, marketCap, adtv, priceToSales, salesGrowth, gfScore,
            peRatio, debtToEquity, operatingMargin, roic, fcfYield, limit } = req.query;

    // Use same default weights as frontend default (30/15/15/20/20)
    const weights = {
      marketCap: parseFloat(marketCap) || 30,
      adtv: parseFloat(adtv) || 15,
      priceToSales: parseFloat(priceToSales) || 15,
      salesGrowth: parseFloat(salesGrowth) || 20,
      gfScore: parseFloat(gfScore) || 20,
      peRatio: parseFloat(peRatio) || 0,
      debtToEquity: parseFloat(debtToEquity) || 0,
      operatingMargin: parseFloat(operatingMargin) || 0,
      roic: parseFloat(roic) || 0,
      fcfYield: parseFloat(fcfYield) || 0
    };

    const years = yearsAgo !== undefined ? parseInt(yearsAgo) : 1;
    const topN = parseInt(limit) || 10;

    console.log(`Getting top ${topN} stocks from ${years} years ago with weights:`, weights);

    let cachedData;

    // For Year 0 (current year), use cached current stock data
    if (years === 0) {
      console.log('Loading current stock data from database cache...');
      cachedData = await getStocksFromDB();

      if (!cachedData || cachedData.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No current stock data available',
          message: 'Call /api/stocks/evaluate?refresh=true first to populate current stock data'
        });
      }
    } else {
      // For historical years, load from database cache
      cachedData = await getAllHistoricalFundamentals(years);

      if (!cachedData || cachedData.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No historical data found for ${years} years ago`,
          message: 'Run fetch-all-historical-data.js first to populate historical data'
        });
      }
    }

    // Set weights for evaluation (with GARP metrics)
    evaluationService.setWeights(
      weights.marketCap,
      weights.adtv,
      weights.priceToSales,
      weights.salesGrowth,
      weights.gfScore,
      weights.peRatio,
      weights.debtToEquity,
      weights.operatingMargin,
      weights.roic,
      weights.fcfYield
    );

    // Evaluate and rank stocks using the same scoring system
    const evaluated = evaluationService.evaluateStocks(cachedData);

    // Reset weights after evaluation
    evaluationService.resetWeights();

    // Take top N stocks with full details (keeping their global ranks)
    const topStocksWithDisplayRanks = evaluated.slice(0, topN);

    res.json({
      success: true,
      data: topStocksWithDisplayRanks,
      metadata: {
        yearsAgo: years,
        topN: topN,
        weights: weights,
        totalStocksEvaluated: cachedData.length,
        calculatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting historical top stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get historical top stocks',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/stocks/historical-stock-returns
 * Get individual stock returns for a specific year
 */
router.get('/historical-stock-returns', async (req, res) => {
  try {
    const { symbols, yearsAgo } = req.query;

    if (!symbols) {
      return res.status(400).json({
        success: false,
        error: 'Missing symbols parameter'
      });
    }

    const symbolArray = symbols.split(',');
    const years = yearsAgo !== undefined ? parseInt(yearsAgo) : 1;

    console.log(`\nFetching returns for ${symbolArray.length} stocks from ${years} years ago`);

    // Calculate dates
    // For yearsAgo=1: startDate = 1 year ago, endDate = today
    // For yearsAgo=5: startDate = 5 years ago, endDate = today
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    const endDate = new Date(); // End date is always TODAY for historical returns

    console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Fetch historical prices for all symbols
    const returnsData = await Promise.all(
      symbolArray.map(async (symbol) => {
        try {
          const historicalData = await stockDataService.getHistoricalPrices(symbol, years + 1);

          if (!historicalData || !historicalData.prices || historicalData.prices.length === 0) {
            console.log(`No price data for ${symbol}`);
            return {
              symbol,
              startPrice: null,
              endPrice: null,
              return: null
            };
          }

          // Find closest prices to start and end dates
          const startPrice = findClosestPrice(historicalData.prices, startDate);
          const endPrice = findClosestPrice(historicalData.prices, endDate);

          if (!startPrice || !endPrice) {
            console.log(`Missing prices for ${symbol}: start=${startPrice}, end=${endPrice}`);
            return {
              symbol,
              startPrice: startPrice || null,
              endPrice: endPrice || null,
              return: null
            };
          }

          const returnPercent = ((endPrice - startPrice) / startPrice) * 100;

          return {
            symbol,
            startPrice,
            endPrice,
            return: returnPercent
          };
        } catch (error) {
          console.error(`Error fetching prices for ${symbol}:`, error.message);
          return {
            symbol,
            startPrice: null,
            endPrice: null,
            return: null
          };
        }
      })
    );

    res.json({
      success: true,
      data: returnsData,
      metadata: {
        yearsAgo: years,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        symbolCount: symbolArray.length
      }
    });
  } catch (error) {
    console.error('Error fetching historical stock returns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical stock returns',
      message: error.message
    });
  }
});

// Helper function to find closest price to a target date
function findClosestPrice(prices, targetDate) {
  if (!prices || prices.length === 0) return null;

  let closestPrice = null;
  let closestDiff = Infinity;

  for (const priceData of prices) {
    const priceDate = new Date(priceData.date);
    const diff = Math.abs(targetDate - priceDate);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestPrice = priceData.adjClose;
    }
  }

  return closestPrice;
}

/**
 * GET /api/stocks/annual-rebalance
 * Calculate annual rebalanced returns (sell all & buy new top N each year)
 */
router.get('/annual-rebalance', async (req, res) => {
  try {
    const {
      marketCap,
      adtv,
      priceToSales,
      salesGrowth,
      gfScore,
      peRatio,
      debtToEquity,
      operatingMargin,
      roic,
      fcfYield,
      portfolioSize = 10,
      refresh
    } = req.query;

    // Build weights object
    const weights = {
      marketCap: parseFloat(marketCap) || 30,
      adtv: parseFloat(adtv) || 15,
      priceToSales: parseFloat(priceToSales) || 15,
      salesGrowth: parseFloat(salesGrowth) || 20,
      gfScore: parseFloat(gfScore) || 20,
      peRatio: parseFloat(peRatio) || 0,
      debtToEquity: parseFloat(debtToEquity) || 0,
      operatingMargin: parseFloat(operatingMargin) || 0,
      roic: parseFloat(roic) || 0,
      fcfYield: parseFloat(fcfYield) || 0
    };

    const size = parseInt(portfolioSize);

    console.log(`\n=== Annual Rebalance Request ===`);
    console.log(`Portfolio Size: ${size}`);
    console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% PS=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);
    console.log(`GARP: PE=${weights.peRatio}% DE=${weights.debtToEquity}% OM=${weights.operatingMargin}% ROIC=${weights.roic}% FCF=${weights.fcfYield}%`);

    // Check if we should use cached data
    const lastUpdate = await getAnnualRebalanceReturnsUpdateTime(weights, size);
    const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity;
    const shouldRefresh = refresh === 'true' || cacheAge > 604800000; // Refresh if > 1 week

    let result;

    if (shouldRefresh) {
      console.log('Calculating fresh annual rebalance returns...');
      // Calculate returns for all periods
      result = await annualRebalanceService.calculateAllPeriods(size, weights);
      // Save to database
      await saveAnnualRebalanceReturns(weights, result, size);
    } else {
      console.log('Using cached annual rebalance returns...');
      const cached = await getAnnualRebalanceReturns(weights, size);
      result = cached.data;
    }

    res.json({
      success: true,
      data: result,
      metadata: {
        strategy: 'annual_rebalance',
        description: `Sell all & buy top ${size} stocks each year (equal weight)`,
        portfolioSize: size,
        calculatedAt: new Date().toISOString(),
        lastUpdate: await getAnnualRebalanceReturnsUpdateTime(weights)
      }
    });
  } catch (error) {
    console.error('Error calculating annual rebalance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate annual rebalance returns',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/stocks/hold-winners
 * Calculate returns using "hold winners" strategy (keep stocks ranked in top 20, replace others)
 */
router.get('/hold-winners', async (req, res) => {
  try {
    const {
      marketCap,
      adtv,
      priceToSales,
      salesGrowth,
      gfScore,
      portfolioSize = 10,
      keepThreshold = 20,
      refresh
    } = req.query;

    // Build weights object
    const weights = {
      marketCap: parseFloat(marketCap) || 30,
      adtv: parseFloat(adtv) || 15,
      priceToSales: parseFloat(priceToSales) || 15,
      salesGrowth: parseFloat(salesGrowth) || 20,
      gfScore: parseFloat(gfScore) || 20
    };

    console.log(`\n=== Hold Winners Request ===`);
    console.log(`Weights: MC=${weights.marketCap}% ADTV=${weights.adtv}% PS=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);
    console.log(`Portfolio size: ${portfolioSize}, Keep threshold: top ${keepThreshold}`);

    // Calculate returns (no caching for now - can add later)
    console.log('Calculating hold winners returns...');
    const result = await holdWinnersService.runBacktest(
      parseInt(portfolioSize),
      parseInt(keepThreshold),
      weights
    );

    res.json({
      success: true,
      data: result,
      metadata: {
        strategy: 'hold_winners',
        description: `Keep stocks ranked in top ${keepThreshold}, replace others`,
        portfolioSize: parseInt(portfolioSize),
        keepThreshold: parseInt(keepThreshold),
        calculatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error calculating hold winners:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate hold winners returns',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/stocks/garp
 * Get stocks filtered by GARP (Growth at Reasonable Price) criteria
 */
router.get('/garp', async (req, res) => {
  try {
    const {
      maxPE,
      maxPEG,
      maxDebtToEquity,
      minOperatingMargin,
      minROIC,
      minFCFYield,
      minSalesGrowth,
      limit
    } = req.query;

    const filters = {
      maxPE: maxPE ? parseFloat(maxPE) : undefined,
      maxPEG: maxPEG ? parseFloat(maxPEG) : undefined,
      maxDebtToEquity: maxDebtToEquity ? parseFloat(maxDebtToEquity) : undefined,
      minOperatingMargin: minOperatingMargin ? parseFloat(minOperatingMargin) : undefined,
      minROIC: minROIC ? parseFloat(minROIC) : undefined,
      minFCFYield: minFCFYield ? parseFloat(minFCFYield) : undefined,
      minSalesGrowth: minSalesGrowth ? parseFloat(minSalesGrowth) : undefined,
      limit: limit ? parseInt(limit) : undefined
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const stocks = await garpService.filterByGARP(filters);

    res.json({
      success: true,
      data: stocks,
      count: stocks.length,
      filters: filters,
      metadata: {
        strategy: 'garp',
        description: 'Growth at Reasonable Price - screens for high growth at reasonable valuations',
        calculatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error filtering GARP stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to filter GARP stocks',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/stocks/garp-stats
 * Get GARP metrics statistics
 */
router.get('/garp-stats', async (req, res) => {
  try {
    const stats = await garpService.getGARPStatistics();

    res.json({
      success: true,
      data: stats,
      metadata: {
        calculatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting GARP statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get GARP statistics',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;
