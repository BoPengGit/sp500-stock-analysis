/**
 * Smart GF Score Scraper
 * Only scrapes stocks that don't already have GF scores in the database
 */

const guruFocusService = require('./server/services/guruFocusService');
const { initializeDatabase, getGFScores } = require('./server/database/db');
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

async function scrapeMissingGFScores() {
  // Initialize database first
  await initializeDatabase();

  // Get existing GF scores from database
  console.log('Checking database for existing GF scores...');
  const existingScores = await getGFScores();
  const existingSymbols = new Set(existingScores.map(score => score.symbol));

  console.log(`Found ${existingScores.length} existing GF scores in database`);

  // Filter out stocks that already have scores
  const missingSymbols = SP500_TICKERS.filter(symbol => !existingSymbols.has(symbol));

  console.log(`\n=== Smart GF Score Scraping ===`);
  console.log(`Total S&P 500 stocks: ${SP500_TICKERS.length}`);
  console.log(`Already scraped: ${existingScores.length}`);
  console.log(`Missing: ${missingSymbols.length}`);

  if (missingSymbols.length === 0) {
    console.log('\n✓ All stocks already have GF scores! No scraping needed.');
    process.exit(0);
  }

  console.log(`\nWill scrape ${missingSymbols.length} missing stocks`);
  console.log(`Estimated time: ~${Math.round((missingSymbols.length * 6) / 60)} minutes`);
  console.log(`Started at: ${new Date().toLocaleTimeString()}\n`);

  const startTime = Date.now();

  // Run the scraper with only missing symbols
  const result = await guruFocusService.batchFetchStockRankings(missingSymbols, 3000);

  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  console.log('\n=== Final Results ===');
  console.log(`Missing stocks to scrape: ${missingSymbols.length}`);
  console.log(`Successfully scraped: ${result.successCount}`);
  console.log(`Failed: ${result.failCount}`);
  console.log(`Success rate: ${((result.successCount / missingSymbols.length) * 100).toFixed(1)}%`);
  console.log(`Duration: ${durationMinutes} minutes`);
  console.log(`Completed at: ${new Date().toLocaleTimeString()}`);

  if (result.failedSymbols.length > 0) {
    console.log(`\nFailed symbols (${result.failedSymbols.length}):`, result.failedSymbols.join(', '));
  }

  // Check database
  console.log('\n=== Database Check ===');
  const finalScores = await getGFScores();
  console.log(`Total GF Scores in database: ${finalScores.length}/${SP500_TICKERS.length}`);
  console.log(`Coverage: ${((finalScores.length / SP500_TICKERS.length) * 100).toFixed(1)}%`);

  process.exit(0);
}

scrapeMissingGFScores().catch(error => {
  console.error('Scraping failed:', error);
  process.exit(1);
});
