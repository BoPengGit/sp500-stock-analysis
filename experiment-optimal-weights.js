#!/usr/bin/env node

/**
 * Experiment: Find Optimal Weight Configuration
 *
 * This script tests various weight combinations to find the configuration
 * that produces the best average returns across all time periods (1, 2, 3, 4, 5 years)
 * for the top 20 stocks portfolio.
 */

const { initializeDatabase, getStocksFromDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');

const TOP_N = 20;

// Generate weight configurations to test
// Each weight component can range from 15% to 40% in 5% increments
// Total must equal 100%
function generateWeightConfigurations() {
  const configs = [];
  const step = 5;
  const minWeight = 15;
  const maxWeight = 40;

  // Generate combinations where weights sum to 100
  for (let mc = minWeight; mc <= maxWeight; mc += step) {
    for (let adtv = minWeight; adtv <= maxWeight; adtv += step) {
      for (let ps = minWeight; ps <= maxWeight; ps += step) {
        for (let sg = minWeight; sg <= maxWeight; sg += step) {
          const gf = 100 - mc - adtv - ps - sg;

          // Check if GF score is valid (15-40 range)
          if (gf >= minWeight && gf <= maxWeight) {
            configs.push({
              marketCap: mc,
              adtv: adtv,
              priceToSales: ps,
              salesGrowth: sg,
              gfScore: gf,
              label: `${mc}-${adtv}-${ps}-${sg}-${gf}`
            });
          }
        }
      }
    }
  }

  return configs;
}

async function testWeightConfiguration(stocks, config) {
  try {
    // Set weights and re-rank stocks
    evaluationService.setWeights(
      config.marketCap,
      config.adtv,
      config.priceToSales,
      config.salesGrowth,
      config.gfScore
    );

    const reranked = evaluationService.evaluateStocks(stocks);
    const topStocks = evaluationService.getTopStocks(reranked, TOP_N);
    const symbols = topStocks.map(s => s.symbol);

    // Calculate portfolio returns
    const returns = await portfolioReturnsService.calculatePortfolioReturns(symbols);

    // Calculate average return across all periods
    const avgReturn = (
      returns.portfolio.oneYear +
      returns.portfolio.twoYear +
      returns.portfolio.threeYear +
      returns.portfolio.fourYear +
      returns.portfolio.fiveYear
    ) / 5;

    // Reset weights
    evaluationService.resetWeights();

    return {
      config: config,
      symbols: symbols,
      returns: returns.portfolio,
      avgReturn: avgReturn,
      validStocks: returns.portfolio.validStocks
    };
  } catch (error) {
    console.error(`Error testing config ${config.label}:`, error.message);
    return null;
  }
}

async function runExperiment() {
  console.log('=== Weight Configuration Optimization Experiment ===\n');
  console.log(`Testing portfolio size: Top ${TOP_N} stocks\n`);

  await initializeDatabase();

  // Get all stocks from database
  const stocks = await getStocksFromDB();

  if (stocks.length === 0) {
    console.log('No stock data available. Please run /api/stocks/evaluate first.');
    return;
  }

  console.log(`Found ${stocks.length} stocks in database.\n`);

  // Generate weight configurations
  const configs = generateWeightConfigurations();
  console.log(`Generated ${configs.length} weight configurations to test.\n`);
  console.log('Testing configurations...\n');

  const results = [];
  let tested = 0;
  let failed = 0;

  // Test each configuration
  for (const config of configs) {
    const result = await testWeightConfiguration(stocks, config);

    if (result) {
      results.push(result);
      tested++;

      // Log progress every 100 configs
      if (tested % 100 === 0) {
        console.log(`Progress: ${tested}/${configs.length} configurations tested...`);
      }
    } else {
      failed++;
    }
  }

  console.log(`\nTesting complete: ${tested} successful, ${failed} failed\n`);

  // Sort results by average return (descending)
  results.sort((a, b) => b.avgReturn - a.avgReturn);

  // Display top 20 results
  console.log('=== TOP 20 WEIGHT CONFIGURATIONS ===\n');
  console.log('Rank | Config (MC-ADTV-PS-SG-GF) | Avg Return | 1Y    | 2Y    | 3Y    | 4Y    | 5Y    | Valid Stocks (1/2/3/4/5Y)');
  console.log('-----|---------------------------|------------|-------|-------|-------|-------|-------|-------------------------');

  for (let i = 0; i < Math.min(20, results.length); i++) {
    const r = results[i];
    const valid = `${r.validStocks.oneYear}/${r.validStocks.twoYear}/${r.validStocks.threeYear}/${r.validStocks.fourYear}/${r.validStocks.fiveYear}`;

    console.log(
      `${String(i + 1).padStart(4)} | ` +
      `${r.config.label.padEnd(25)} | ` +
      `${r.avgReturn.toFixed(2).padStart(9)}% | ` +
      `${r.returns.oneYear.toFixed(2).padStart(5)}% | ` +
      `${r.returns.twoYear.toFixed(2).padStart(5)}% | ` +
      `${r.returns.threeYear.toFixed(2).padStart(5)}% | ` +
      `${r.returns.fourYear.toFixed(2).padStart(5)}% | ` +
      `${r.returns.fiveYear.toFixed(2).padStart(5)}% | ` +
      valid
    );
  }

  // Display best configuration details
  if (results.length > 0) {
    const best = results[0];
    console.log('\n=== OPTIMAL CONFIGURATION ===');
    console.log(`Weight Configuration: ${best.config.label}`);
    console.log(`  Market Cap Weight: ${best.config.marketCap}%`);
    console.log(`  ADTV Weight: ${best.config.adtv}%`);
    console.log(`  Price/Sales Weight: ${best.config.priceToSales}%`);
    console.log(`  Sales Growth Weight: ${best.config.salesGrowth}%`);
    console.log(`  GF Score Weight: ${best.config.gfScore}%`);
    console.log(`\nAverage Return: ${best.avgReturn.toFixed(2)}%`);
    console.log(`  1-Year: ${best.returns.oneYear.toFixed(2)}% (${best.validStocks.oneYear} stocks)`);
    console.log(`  2-Year: ${best.returns.twoYear.toFixed(2)}% (${best.validStocks.twoYear} stocks)`);
    console.log(`  3-Year: ${best.returns.threeYear.toFixed(2)}% (${best.validStocks.threeYear} stocks)`);
    console.log(`  4-Year: ${best.returns.fourYear.toFixed(2)}% (${best.validStocks.fourYear} stocks)`);
    console.log(`  5-Year: ${best.returns.fiveYear.toFixed(2)}% (${best.validStocks.fiveYear} stocks)`);
    console.log(`\nTop ${TOP_N} Stocks: ${best.symbols.join(', ')}`);

    // Show comparison with current configurations
    console.log('\n=== COMPARISON WITH CURRENT CONFIGS ===');
    const currentConfigs = [
      '15-15-15-40-15',
      '35-35-15-15-0',
      '20-20-20-20-20',
      '30-30-15-15-10',
      '20-20-25-25-10'
    ];

    for (const label of currentConfigs) {
      const found = results.find(r => r.config.label === label);
      if (found) {
        const rank = results.indexOf(found) + 1;
        console.log(`  ${label}: Rank #${rank}, Avg: ${found.avgReturn.toFixed(2)}%`);
      }
    }
  }

  console.log('\n=== Experiment Complete ===');
}

(async () => {
  try {
    await runExperiment();
    process.exit(0);
  } catch (error) {
    console.error('Experiment failed:', error);
    process.exit(1);
  }
})();
