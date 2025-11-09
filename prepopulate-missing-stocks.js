/**
 * Prepopulate Missing Stock Data Script
 *
 * Smart script that REUSES existing database data and only fetches missing stocks from FMP API.
 * This avoids wasting API calls on stocks we already have.
 */

const { initializeDatabase, getStocksFromDB, saveStocksToDB, savePortfolioReturns } = require('./server/database/db');
const stockDataService = require('./server/services/stockDataService');
const evaluationService = require('./server/services/evaluationService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

// Weight configurations to prepopulate (matching frontend exactly)
const WEIGHT_CONFIGS = [
  { marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0, label: '35-35-15-15-0' },
  { marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20, label: '20-20-20-20-20' },
  { marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10, label: '30-30-15-15-10' },
  { marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10, label: '20-20-25-25-10' }
];

async function prepopulateMissingStocks() {
  console.log('=== Smart Database Prepopulation Started ===\n');
  const startTime = Date.now();

  // Initialize database
  await initializeDatabase();

  // Step 1: Get existing stocks from database
  console.log('Step 1/3: Checking existing database...');
  const existingStocks = await getStocksFromDB();
  const existingSymbols = new Set(existingStocks.map(s => s.symbol));

  console.log(`✓ Found ${existingStocks.length} stocks already in database`);
  console.log(`✓ Will reuse existing data to save API calls\n`);

  // Step 2: Identify missing stocks
  const missingTickers = SP500_TICKERS.filter(ticker => !existingSymbols.has(ticker));
  console.log(`Step 2/3: Fetching missing stocks...`);
  console.log(`✓ ${existingStocks.length} stocks already cached`);
  console.log(`✓ ${missingTickers.length} stocks need to be fetched from FMP API\n`);

  let allStocks = [...existingStocks];

  if (missingTickers.length > 0) {
    console.log(`Fetching ${missingTickers.length} missing stocks from FMP API...`);
    const newStockData = await stockDataService.batchFetchStocks(missingTickers);
    console.log(`✓ Fetched ${newStockData.length} new stocks`);

    const evaluatedNew = evaluationService.evaluateStocks(newStockData);
    await saveStocksToDB(evaluatedNew);
    console.log(`✓ Saved ${evaluatedNew.length} new stocks to database\n`);

    allStocks = [...existingStocks, ...evaluatedNew];
  } else {
    console.log('✓ All stocks already in database, no API calls needed!\n');
  }

  // Step 3: Prepopulate portfolio returns for all weight combinations
  console.log(`Step 3/3: Prepopulating portfolio returns with ${allStocks.length} total stocks...`);
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
    const reranked = evaluationService.evaluateStocks(allStocks);
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
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  console.log('=== Database Prepopulation Complete ===');
  console.log(`Total duration: ${durationSeconds} seconds`);
  console.log(`Total stocks in database: ${allStocks.length}/${SP500_TICKERS.length}`);
  console.log(`API calls saved by reusing cache: ${existingStocks.length * 4}`);
  console.log('\nDatabase is now fully populated. Frontend will use cached data only.');
  console.log('No live calculations will be triggered by user interactions.\n');

  process.exit(0);
}

prepopulateMissingStocks().catch(error => {
  console.error('Prepopulation failed:', error);
  process.exit(1);
});
