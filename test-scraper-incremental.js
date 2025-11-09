/**
 * Test script to verify incremental database saving with error recovery
 * Tests with just 3 stocks
 */

const guruFocusService = require('./server/services/guruFocusService');
const { initializeDatabase, getGFScores } = require('./server/database/db');

async function testIncrementalScraping() {
  // Initialize database first
  await initializeDatabase();

  console.log('=== Testing Incremental GF Score Scraping ===\n');

  // Test with just 3 stocks
  const testSymbols = ['AAPL', 'MSFT', 'GOOGL'];

  console.log(`Testing with ${testSymbols.length} stocks: ${testSymbols.join(', ')}\n`);

  // Run the scraper
  const result = await guruFocusService.batchFetchStockRankings(testSymbols, 2000);

  console.log('\n=== Scraping Results ===');
  console.log(`Success: ${result.successCount}`);
  console.log(`Failed: ${result.failCount}`);
  if (result.failedSymbols.length > 0) {
    console.log(`Failed symbols: ${result.failedSymbols.join(', ')}`);
  }

  // Check what's in the database
  console.log('\n=== Checking Database ===');
  const scores = await getGFScores();
  console.log(`Total GF Scores in database: ${scores.length}`);

  if (scores.length > 0) {
    console.log('\nScores found:');
    scores.forEach(score => {
      console.log(`  ${score.symbol}: GF Score = ${score.gfScore}, GF Value = $${score.gfValue}`);
    });
  }

  process.exit(0);
}

testIncrementalScraping().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
