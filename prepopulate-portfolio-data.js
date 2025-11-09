/**
 * Prepopulate Portfolio Data Script
 *
 * Fetches and caches portfolio returns data for the frontend:
 * 1. Fetch and evaluate all S&P 500 stocks with GF Scores (already in DB)
 * 2. Calculate portfolio returns for different weight configurations
 *
 * This ensures the frontend gets pre-calculated data quickly.
 */

const { initializeDatabase, getStocksFromDB, savePortfolioReturns } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');

// Weight configurations to prepopulate (matching frontend)
const WEIGHT_CONFIGS = [
  { marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0, label: '35-35-15-15-0' },
  { marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20, label: '20-20-20-20-20' },
  { marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10, label: '30-30-15-15-10' },
  { marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10, label: '20-20-25-25-10' }
];

async function prepopulatePortfolioData() {
  console.log('=== Portfolio Data Prepopulation Started ===\n');
  const startTime = Date.now();

  // Initialize database
  await initializeDatabase();

  // Get stocks from database (includes GF Scores via LEFT JOIN)
  console.log('Loading stocks from database...');
  const stocks = await getStocksFromDB();
  console.log(`✓ Loaded ${stocks.length} stocks from database`);

  // Check how many have GF Scores
  const stocksWithGF = stocks.filter(s => s.gfScore !== null && s.gfScore !== undefined);
  console.log(`✓ ${stocksWithGF.length} stocks have GF Scores\n`);

  // Prepopulate portfolio returns for all weight combinations
  console.log('Prepopulating portfolio returns...');
  let portfolioCount = 0;

  for (const weights of WEIGHT_CONFIGS) {
    console.log(`  Computing portfolio returns for ${weights.label}...`);

    try {
      // Apply weights and get top 10 stocks
      evaluationService.setWeights(
        weights.marketCap,
        weights.adtv,
        weights.priceToSales,
        weights.salesGrowth,
        weights.gfScore
      );

      const reranked = evaluationService.evaluateStocks(stocks);
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
    } catch (error) {
      console.error(`    ✗ Failed for ${weights.label}: ${error.message}\n`);
    }
  }

  console.log(`✓ Prepopulated ${portfolioCount} portfolio return configurations\n`);

  const endTime = Date.now();
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  console.log('=== Portfolio Data Prepopulation Complete ===');
  console.log(`Total duration: ${durationSeconds} seconds`);
  console.log('\nFrontend can now quickly access pre-calculated portfolio returns.\n');

  process.exit(0);
}

prepopulatePortfolioData().catch(error => {
  console.error('Prepopulation failed:', error);
  process.exit(1);
});
