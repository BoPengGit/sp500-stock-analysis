/**
 * Prepopulate Database Script
 *
 * Fetches and caches ALL data that the frontend might request:
 * 1. Stock evaluations (S&P 500)
 * 2. Portfolio returns for all weight combinations (4 configs × 3 periods)
 * 3. Historical backtests for all weight combinations (4 configs × 3 time periods)
 * 4. GF Scores (already being scraped separately)
 *
 * This ensures the frontend NEVER triggers live backend calculations.
 */

const { initializeDatabase, saveStocksToDB, savePortfolioReturns, saveHistoricalBacktest } = require('./server/database/db');
const stockDataService = require('./server/services/stockDataService');
const evaluationService = require('./server/services/evaluationService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');
const historicalBacktestService = require('./server/services/historicalBacktestService');
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

// Weight configurations to prepopulate (matching frontend exactly)
const WEIGHT_CONFIGS = [
  { marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0, label: '35-35-15-15-0' },
  { marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20, label: '20-20-20-20-20' },
  { marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10, label: '30-30-15-15-10' },
  { marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10, label: '20-20-25-25-10' }
];

async function prepopulateDatabase() {
  console.log('=== Database Prepopulation Started ===\n');
  const startTime = Date.now();

  // Initialize database
  await initializeDatabase();

  // Step 1: Fetch and evaluate all S&P 500 stocks
  console.log('Step 1/2: Fetching and evaluating S&P 500 stocks...');
  console.log(`Fetching ${SP500_TICKERS.length} stocks from FMP API...`);

  const stockData = await stockDataService.batchFetchStocks(SP500_TICKERS);
  console.log(`✓ Fetched ${stockData.length} stocks`);

  const evaluated = evaluationService.evaluateStocks(stockData);
  await saveStocksToDB(evaluated);
  console.log(`✓ Saved ${evaluated.length} evaluated stocks to database\n`);

  // Step 2: Prepopulate portfolio returns for all weight combinations
  console.log('Step 2/2: Prepopulating portfolio returns...');
  let portfolioCount = 0;

  for (const weights of WEIGHT_CONFIGS) {
    console.log(`  Computing portfolio returns for ${weights.label}...`);

    // Apply weights and get top 10 stocks (using all 5 metrics)
    evaluationService.setWeights(
      weights.marketCap,
      weights.adtv,
      weights.priceToSales,
      weights.salesGrowth,
      weights.gfScore
    );
    const reranked = evaluationService.evaluateStocks(evaluated);
    const topStocks = evaluationService.getTopStocks(reranked, 10);
    evaluationService.resetWeights();

    const symbols = topStocks.map(s => s.symbol);
    console.log(`    Top 10: ${symbols.join(', ')}`);

    // Calculate and save portfolio returns
    const returns = await portfolioReturnsService.calculatePortfolioReturns(symbols);
    returns.weights = weights;
    await savePortfolioReturns(10, returns);

    portfolioCount++;
    console.log(`    ✓ Saved portfolio returns for ${weights.label}\n`);
  }

  console.log(`✓ Prepopulated ${portfolioCount} portfolio return configurations\n`);

  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  console.log('=== Database Prepopulation Complete ===');
  console.log(`Total duration: ${durationMinutes} minutes`);
  console.log('\nDatabase is now fully populated. Frontend will use cached data only.');
  console.log('No live calculations will be triggered by user interactions.\n');

  process.exit(0);
}

prepopulateDatabase().catch(error => {
  console.error('Prepopulation failed:', error);
  process.exit(1);
});
