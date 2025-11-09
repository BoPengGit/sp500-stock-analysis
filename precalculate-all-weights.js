const { initializeDatabase, getStocksFromDB, saveStocksToDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');

/**
 * Pre-calculate all weight configurations used in the frontend
 * This ensures instant response times when switching between configurations
 */

const WEIGHT_CONFIGS = [
  { name: '35-35-15-15-0 (FANG+ Original)', marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0 },
  { name: '20-20-20-20-20 (Equal)', marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20 },
  { name: '30-30-15-15-10 (MC+ADTV Focus)', marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10 },
  { name: '20-20-25-25-10 (Value+Growth)', marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10 },
  { name: '0-0-0-0-100 (GF Score Only)', marketCap: 0, adtv: 0, priceToSales: 0, salesGrowth: 0, gfScore: 100 },
  { name: '100-0-0-0-0 (Market Cap Only)', marketCap: 100, adtv: 0, priceToSales: 0, salesGrowth: 0, gfScore: 0 },
  { name: '0-100-0-0-0 (ADTV Only)', marketCap: 0, adtv: 100, priceToSales: 0, salesGrowth: 0, gfScore: 0 },
  { name: '0-0-0-100-0 (Sales Growth Only)', marketCap: 0, adtv: 0, priceToSales: 0, salesGrowth: 100, gfScore: 0 },
  { name: '0-0-100-0-0 (P/S Ratio Only)', marketCap: 0, adtv: 0, priceToSales: 100, salesGrowth: 0, gfScore: 0 }
];

(async () => {
  console.log('=== Pre-calculating All Weight Configurations ===\n');

  await initializeDatabase();

  // Get base stock data (with duplicates already merged)
  const rawStocks = await getStocksFromDB();

  if (rawStocks.length === 0) {
    console.error('ERROR: No stock data in database!');
    console.error('Please run the /api/stocks/evaluate endpoint first to populate stock data.');
    process.exit(1);
  }

  console.log(`Found ${rawStocks.length} stocks in database\n`);

  // For each weight configuration, calculate and save rankings
  for (const config of WEIGHT_CONFIGS) {
    console.log(`\nCalculating: ${config.name}`);
    console.log(`  Weights: MC=${config.marketCap}% ADTV=${config.adtv}% P/S=${config.priceToSales}% Growth=${config.salesGrowth}% GF=${config.gfScore}%`);

    // Set the weights
    evaluationService.setWeights(
      config.marketCap,
      config.adtv,
      config.priceToSales,
      config.salesGrowth,
      config.gfScore
    );

    // Evaluate stocks with these weights
    const rankedStocks = evaluationService.evaluateStocks(rawStocks);

    // Show top 5
    console.log('  Top 5 stocks:');
    rankedStocks.slice(0, 5).forEach((stock, idx) => {
      console.log(`    ${idx + 1}. ${stock.symbol} - Score: ${stock.weightedScore.toFixed(2)}`);
    });

    // Save to database with weight configuration in metadata
    // The database will store this as a separate cache entry
    await saveStocksToDB(rankedStocks, {
      weightConfig: config.name,
      weights: {
        marketCap: config.marketCap,
        adtv: config.adtv,
        priceToSales: config.priceToSales,
        salesGrowth: config.salesGrowth,
        gfScore: config.gfScore
      }
    });

    console.log(`  ✓ Saved to database`);

    // Reset weights to default
    evaluationService.resetWeights();
  }

  console.log('\n\n=== Summary ===');
  console.log(`✓ Pre-calculated ${WEIGHT_CONFIGS.length} weight configurations`);
  console.log('✓ All configurations cached in database');
  console.log('✓ Frontend will now load instantly when switching between configurations');

  process.exit(0);
})();
