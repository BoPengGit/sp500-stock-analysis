/**
 * Full S&P 500 GF Score Scraper
 * Scrapes all 440 stocks with incremental database saving and error recovery
 */

const guruFocusService = require('./server/services/guruFocusService');
const { initializeDatabase, getGFScores } = require('./server/database/db');
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

async function scrapeAllGFScores() {
  // Initialize database first
  await initializeDatabase();

  console.log('=== Starting Full S&P 500 GF Score Scrape ===');
  console.log(`Total stocks to scrape: ${SP500_TICKERS.length}`);
  console.log(`Estimated time: ~${Math.round((SP500_TICKERS.length * 3) / 60)} minutes`);
  console.log(`Started at: ${new Date().toLocaleTimeString()}\n`);

  const startTime = Date.now();

  // Run the scraper with all S&P 500 tickers
  const result = await guruFocusService.batchFetchStockRankings(SP500_TICKERS, 3000);

  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  console.log('\n=== Final Results ===');
  console.log(`Total stocks: ${SP500_TICKERS.length}`);
  console.log(`Successfully scraped: ${result.successCount}`);
  console.log(`Failed: ${result.failCount}`);
  console.log(`Success rate: ${((result.successCount / SP500_TICKERS.length) * 100).toFixed(1)}%`);
  console.log(`Duration: ${durationMinutes} minutes`);
  console.log(`Completed at: ${new Date().toLocaleTimeString()}`);

  if (result.failedSymbols.length > 0) {
    console.log(`\nFailed symbols (${result.failedSymbols.length}):`, result.failedSymbols.join(', '));
  }

  // Check database
  console.log('\n=== Database Check ===');
  const scores = await getGFScores();
  console.log(`Total GF Scores in database: ${scores.length}`);

  // Show some sample scores
  if (scores.length > 0) {
    console.log('\nSample scores (first 5):');
    scores.slice(0, 5).forEach(score => {
      console.log(`  ${score.symbol}: GF Score = ${score.gfScore}, GF Value = $${score.gfValue}`);
    });
  }

  process.exit(0);
}

scrapeAllGFScores().catch(error => {
  console.error('Scraping failed:', error);
  process.exit(1);
});
