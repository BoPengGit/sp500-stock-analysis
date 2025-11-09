const holdWinnersService = require('./server/services/holdWinnersService');
const { initializeDatabase } = require('./server/database/db');

/**
 * Comprehensive Testing Script
 * Tests all weight configurations across all 12 portfolio combinations
 */

const WEIGHT_CONFIGS = {
  '5-30-5-50-5-0-0-0-0-5': {
    marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 50, gfScore: 5,
    peRatio: 0, debtToEquity: 0, operatingMargin: 0, roic: 0, fcfYield: 5
  },
  '5-30-5-50-5-5-0-0-0-0': {
    marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 50, gfScore: 5,
    peRatio: 5, debtToEquity: 0, operatingMargin: 0, roic: 0, fcfYield: 0
  },
  '5-30-5-55-5': {
    marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 55, gfScore: 5
  },
  '30-15-15-20-20': {
    marketCap: 30, adtv: 15, priceToSales: 15, salesGrowth: 20, gfScore: 20
  },
  '15-15-15-40-15': {
    marketCap: 15, adtv: 15, priceToSales: 15, salesGrowth: 40, gfScore: 15
  },
  '35-35-15-15-0': {
    marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0
  },
  '20-20-20-20-20': {
    marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20
  }
};

const PORTFOLIO_CONFIGS = [
  { size: 5, threshold: 10 },
  { size: 5, threshold: 20 },
  { size: 5, threshold: 30 },
  { size: 10, threshold: 10 },
  { size: 10, threshold: 20 },
  { size: 10, threshold: 30 },
  { size: 15, threshold: 10 },
  { size: 15, threshold: 20 },
  { size: 15, threshold: 30 },
  { size: 20, threshold: 10 },
  { size: 20, threshold: 20 },
  { size: 20, threshold: 30 }
];

async function testConfiguration(weightKey, weights, portfolioSize, keepThreshold) {
  try {
    const result = await holdWinnersService.calculateHoldWinnersReturn(
      5, // 5 years
      portfolioSize,
      keepThreshold,
      weights
    );

    return {
      success: true,
      return5yr: result.totalReturn,
      portfolioSize,
      keepThreshold,
      weightKey
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      portfolioSize,
      keepThreshold,
      weightKey
    };
  }
}

async function main() {
  console.log('='.repeat(100));
  console.log('COMPREHENSIVE WEIGHT CONFIGURATION TESTING');
  console.log('='.repeat(100));
  console.log('');

  await initializeDatabase();

  const allResults = {};

  for (const [weightKey, weights] of Object.entries(WEIGHT_CONFIGS)) {
    console.log('\n' + '#'.repeat(100));
    console.log(`TESTING: ${weightKey}`);
    console.log('#'.repeat(100));
    console.log(`Weights: MC=${weights.marketCap}, ADTV=${weights.adtv}, P/S=${weights.priceToSales}, SG=${weights.salesGrowth}, GF=${weights.gfScore || 0}, PE=${weights.peRatio || 0}, FCFYield=${weights.fcfYield || 0}`);
    console.log('');

    const configResults = [];
    let totalReturn = 0;
    let successCount = 0;

    for (const config of PORTFOLIO_CONFIGS) {
      const configLabel = `${config.size}/${config.threshold}`;
      process.stdout.write(`  Testing ${configLabel}... `);

      const result = await testConfiguration(weightKey, weights, config.size, config.threshold);

      if (result.success && result.return5yr !== null) {
        console.log(`✓ ${result.return5yr.toFixed(2)}%`);
        configResults.push({
          config: configLabel,
          return: result.return5yr
        });
        totalReturn += result.return5yr;
        successCount++;
      } else {
        console.log(`✗ ${result.error || 'No data'}`);
        configResults.push({
          config: configLabel,
          return: null,
          error: result.error
        });
      }
    }

    const avgReturn = successCount > 0 ? totalReturn / successCount : 0;

    allResults[weightKey] = {
      configs: configResults,
      avgReturn: avgReturn,
      successCount: successCount
    };

    console.log('');
    console.log(`Summary for ${weightKey}:`);
    console.log(`  Average Return: ${avgReturn.toFixed(2)}%`);
    console.log(`  Successful Configs: ${successCount}/${PORTFOLIO_CONFIGS.length}`);
    console.log('  Individual Results:');
    configResults.forEach(r => {
      if (r.return !== null) {
        console.log(`    ${r.config}: ${r.return.toFixed(2)}%`);
      } else {
        console.log(`    ${r.config}: ERROR - ${r.error || 'No data'}`);
      }
    });
  }

  // Final comparison
  console.log('\n\n' + '='.repeat(100));
  console.log('FINAL COMPARISON - ALL WEIGHT CONFIGURATIONS');
  console.log('='.repeat(100));
  console.log('');

  const sortedResults = Object.entries(allResults)
    .map(([key, data]) => ({
      key,
      avgReturn: data.avgReturn,
      successCount: data.successCount
    }))
    .sort((a, b) => b.avgReturn - a.avgReturn);

  sortedResults.forEach((result, index) => {
    console.log(`${index + 1}. ${result.key}`);
    console.log(`   Average 5-Year Return: ${result.avgReturn.toFixed(2)}%`);
    console.log(`   Successful Configs: ${result.successCount}/12`);
    console.log('');
  });

  // Detailed breakdown for top 3
  console.log('\n' + '='.repeat(100));
  console.log('DETAILED BREAKDOWN - TOP 3 CONFIGURATIONS');
  console.log('='.repeat(100));

  for (let i = 0; i < Math.min(3, sortedResults.length); i++) {
    const topConfig = sortedResults[i];
    const configData = allResults[topConfig.key];

    console.log(`\n${i + 1}. ${topConfig.key} - Avg Return: ${topConfig.avgReturn.toFixed(2)}%`);
    console.log('   Portfolio Config | 5-Year Return');
    console.log('   ' + '-'.repeat(40));

    configData.configs
      .sort((a, b) => (b.return || -Infinity) - (a.return || -Infinity))
      .forEach(c => {
        if (c.return !== null) {
          console.log(`   ${c.config.padEnd(16)} | ${c.return.toFixed(2)}%`);
        } else {
          console.log(`   ${c.config.padEnd(16)} | ERROR`);
        }
      });
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
