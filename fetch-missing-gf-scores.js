/**
 * Fetch Missing Current GF Scores
 *
 * Scrapes current GF Scores for stocks that don't have them yet
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { SP500_TICKERS } = require('./server/config/sp500-tickers');
const guruFocusService = require('./server/services/guruFocusService');
const {
  initializeDatabase,
  getGFScores,
  saveGFScore
} = require('./server/database/db');

const DELAY_BETWEEN_SCRAPES = 5000; // 5 seconds between scrapes

async function main() {
  console.log('================================================================================');
  console.log('FETCH MISSING CURRENT GF SCORES');
  console.log('================================================================================');

  // Initialize database
  await initializeDatabase();

  // Get existing GF Scores
  const existingScores = await getGFScores();
  const existingSymbols = new Set(existingScores.map(s => s.symbol));

  // Find missing symbols
  const missingSymbols = SP500_TICKERS.filter(symbol => !existingSymbols.has(symbol));

  console.log(`Total S&P 500 stocks: ${SP500_TICKERS.length}`);
  console.log(`Existing GF Scores: ${existingSymbols.size}`);
  console.log(`Missing GF Scores: ${missingSymbols.length}`);

  if (missingSymbols.length === 0) {
    console.log('\n✓ All stocks have current GF Scores!');
    process.exit(0);
  }

  console.log(`\nMissing symbols: ${missingSymbols.join(', ')}`);
  console.log(`\nStarting to scrape ${missingSymbols.length} missing GF Scores...`);
  console.log('================================================================================\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < missingSymbols.length; i++) {
    const symbol = missingSymbols[i];

    try {
      console.log(`[${i + 1}/${missingSymbols.length}] Scraping ${symbol}...`);
      const gfData = await guruFocusService.getStockRanking(symbol);

      if (gfData && gfData.gfScore !== null) {
        await saveGFScore(gfData);
        successCount++;
        console.log(`✓ ${symbol}: GF Score = ${gfData.gfScore}`);
      } else {
        failCount++;
        console.log(`✗ ${symbol}: No GF Score found`);
      }
    } catch (error) {
      failCount++;
      console.error(`✗ ${symbol}: Error - ${error.message}`);
    }

    // Wait before next scrape (except for last one)
    if (i < missingSymbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SCRAPES));
    }
  }

  // Close GuruFocus browser
  await guruFocusService.closeBrowser();

  console.log('\n================================================================================');
  console.log('MISSING GF SCORES COLLECTION COMPLETE');
  console.log('================================================================================');
  console.log(`Success: ${successCount} | Failed: ${failCount}`);
  console.log('================================================================================');

  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
