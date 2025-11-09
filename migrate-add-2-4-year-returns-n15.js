#!/usr/bin/env node

/**
 * Migration Script: Add 2-Year and 4-Year Returns to Top 15 Stocks Portfolio
 *
 * This script calculates and caches portfolio returns for top 15 stocks
 * for all weight configurations.
 */

const { initializeDatabase, getStocksFromDB, savePortfolioReturns } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');

// Weight configurations to calculate
const WEIGHT_CONFIGS = [
  { name: '15-15-15-40-15 (Growth Max)', weights: { marketCap: 15, adtv: 15, priceToSales: 15, salesGrowth: 40, gfScore: 15 } },
  { name: '35-35-15-15-0 (FANG+ Original)', weights: { marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0 } },
  { name: '20-20-20-20-20 (Equal)', weights: { marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20 } },
  { name: '30-30-15-15-10 (MC+ADTV Focus)', weights: { marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10 } },
  { name: '20-20-25-25-10 (Value+Growth)', weights: { marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10 } }
];

const TOP_N = 15;

async function migratePortfolioReturns() {
  console.log(`=== Migration: Calculate Portfolio Returns for Top ${TOP_N} Stocks ===\n`);

  await initializeDatabase();

  // Get all stocks from database
  const stocks = await getStocksFromDB();

  if (stocks.length === 0) {
    console.log('No stock data available. Please run /api/stocks/evaluate first.');
    return;
  }

  console.log(`Found ${stocks.length} stocks in database.\n`);

  for (const config of WEIGHT_CONFIGS) {
    try {
      console.log(`Processing: ${config.name}`);
      console.log(`  Weights: MC=${config.weights.marketCap}% ADTV=${config.weights.adtv}% PS=${config.weights.priceToSales}% SG=${config.weights.salesGrowth}% GF=${config.weights.gfScore}%`);

      // Set weights and re-rank stocks
      evaluationService.setWeights(
        config.weights.marketCap,
        config.weights.adtv,
        config.weights.priceToSales,
        config.weights.salesGrowth,
        config.weights.gfScore
      );

      const reranked = evaluationService.evaluateStocks(stocks);
      const topStocks = evaluationService.getTopStocks(reranked, TOP_N);
      const symbols = topStocks.map(s => s.symbol);

      console.log(`  Top ${TOP_N} stocks: ${symbols.join(', ')}`);

      // Calculate portfolio returns
      const returns = await portfolioReturnsService.calculatePortfolioReturns(symbols);
      returns.weights = config.weights;

      // Save to database
      await savePortfolioReturns(TOP_N, returns);

      console.log(`  ✅ Cached returns for top ${TOP_N}`);
      console.log(`     1-Year: ${returns.portfolio.oneYear.toFixed(2)}% (${returns.portfolio.validStocks.oneYear} stocks)`);
      console.log(`     2-Year: ${returns.portfolio.twoYear.toFixed(2)}% (${returns.portfolio.validStocks.twoYear} stocks)`);
      console.log(`     3-Year: ${returns.portfolio.threeYear.toFixed(2)}% (${returns.portfolio.validStocks.threeYear} stocks)`);
      console.log(`     4-Year: ${returns.portfolio.fourYear.toFixed(2)}% (${returns.portfolio.validStocks.fourYear} stocks)`);
      console.log(`     5-Year: ${returns.portfolio.fiveYear.toFixed(2)}% (${returns.portfolio.validStocks.fiveYear} stocks)\n`);

      // Reset weights
      evaluationService.resetWeights();

    } catch (error) {
      console.error(`  ❌ Error processing ${config.name}:`, error.message);
    }
  }

  console.log('Migration complete!');
}

(async () => {
  try {
    await migratePortfolioReturns();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();
