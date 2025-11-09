/**
 * Fetch All Historical GF Scores - OPTIMIZED VERSION
 *
 * Scrapes historical GF Scores for ALL S&P 500 stocks for the past 5 years
 * Uses the optimized method that extracts ALL years from a single page load
 *
 * This is MUCH faster than the year-by-year approach:
 * - Old approach: 502 stocks × 5 years = 2,510 page loads (3-5 hours)
 * - New approach: 502 stocks × 1 page = 502 page loads (~45-60 minutes)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { SP500_TICKERS } = require('./server/config/sp500-tickers');
const guruFocusService = require('./server/services/guruFocusService');
const {
  initializeDatabase,
  getHistoricalFundamental,
  saveHistoricalFundamental
} = require('./server/database/db');

const DELAY_BETWEEN_SCRAPES = 6000; // 6 seconds between scrapes
const BATCH_SIZE = 10; // Process 10 stocks at a time, then take a longer break
const BATCH_DELAY = 30000; // 30 second break between batches

async function main() {
  console.log('================================================================================');
  console.log('OPTIMIZED HISTORICAL GF SCORES COLLECTION');
  console.log('================================================================================');
  console.log(`Total Stocks: ${SP500_TICKERS.length}`);
  console.log(`Collecting: ALL available historical years (typically 10-17 years per stock)`);
  console.log(`Page Loads: ${SP500_TICKERS.length} (one per stock)`);
  console.log(`Estimated Time: 45-60 minutes`);
  console.log('================================================================================\n');

  // Initialize database
  await initializeDatabase();

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failedSymbols = [];

  // Process stocks in batches
  for (let i = 0; i < SP500_TICKERS.length; i += BATCH_SIZE) {
    const batch = SP500_TICKERS.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(SP500_TICKERS.length / BATCH_SIZE);

    console.log(`\n--- Batch ${batchNum}/${totalBatches} (Stocks ${i + 1}-${Math.min(i + BATCH_SIZE, SP500_TICKERS.length)}) ---`);

    // Process each stock in the batch
    for (const symbol of batch) {
      try {
        // Scrape ALL historical GF Scores for this stock (one page load gets all years)
        console.log(`→ ${symbol}: Scraping all historical GF Scores...`);
        const allScores = await guruFocusService.getAllHistoricalStockRankings(symbol);

        if (!allScores || allScores.length === 0) {
          totalFailed++;
          failedSymbols.push(symbol);
          console.log(`✗ ${symbol}: No GF Scores found`);
          continue;
        }

        // Save ALL scores (all years from 0 to 17+ years ago)
        let savedCount = 0;
        let skippedCount = 0;

        for (const scoreData of allScores) {
          const yearsAgo = scoreData.yearsAgo;

          // Get existing data to check if we already have this GF Score
          const existingData = await getHistoricalFundamental(symbol, yearsAgo);

          // Skip if we already have a GF Score for this year
          if (existingData && existingData.gfScore !== null) {
            skippedCount++;
            continue;
          }

          // Save or update with GF Score
          const recordToSave = existingData ? {
            ...existingData,
            gfScore: scoreData.gfScore
          } : {
            symbol: symbol,
            yearsAgo: yearsAgo,
            marketCap: null,
            adtv: null,
            priceToSales: null,
            salesGrowth: null,
            gfScore: scoreData.gfScore,
            date: scoreData.date
          };

          await saveHistoricalFundamental(recordToSave);
          savedCount++;
        }

        if (savedCount > 0) {
          totalSuccess++;
          console.log(`✓ ${symbol}: Saved ${savedCount} GF Scores (${allScores.length} total years, ${skippedCount} already in DB)`);
        } else if (skippedCount > 0) {
          totalSkipped++;
          console.log(`⊙ ${symbol}: All ${skippedCount} GF Scores already in database (skipped)`);
        } else {
          totalFailed++;
          failedSymbols.push(symbol);
          console.log(`✗ ${symbol}: No GF Scores to save`);
        }

        // Wait before next scrape (except for last one in batch)
        if (symbol !== batch[batch.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SCRAPES));
        }
      } catch (error) {
        totalFailed++;
        failedSymbols.push(symbol);
        console.error(`✗ ${symbol}: Error - ${error.message}`);

        // If browser crashed, try to reinitialize
        if (error.message.includes('Connection closed') || error.message.includes('Target closed')) {
          console.log('Browser may have crashed, waiting before continuing...');
          await guruFocusService.closeBrowser();
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    // Progress summary for this batch
    const processed = Math.min(i + BATCH_SIZE, SP500_TICKERS.length);
    console.log(`\nBatch ${batchNum} Complete: ${processed}/${SP500_TICKERS.length} stocks processed`);
    console.log(`Success: ${totalSuccess} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);

    // Wait before next batch (except for last batch)
    if (i + BATCH_SIZE < SP500_TICKERS.length) {
      console.log(`\nWaiting ${BATCH_DELAY / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  // Close GuruFocus browser
  await guruFocusService.closeBrowser();

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY - HISTORICAL GF SCORES COLLECTION');
  console.log('='.repeat(80));
  console.log(`Total Success: ${totalSuccess}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log(`Total Skipped: ${totalSkipped}`);
  if (failedSymbols.length > 0) {
    console.log(`\nFailed symbols: ${failedSymbols.join(', ')}`);
  }
  console.log('='.repeat(80));

  // Show final database status for key years (1-5 years ago for backtesting)
  console.log('\nVerifying database (key years for backtesting)...');
  const keyYears = [1, 2, 3, 4, 5];
  for (const yearsAgo of keyYears) {
    const { getHistoricalDataCount } = require('./server/database/db');
    const count = await getHistoricalDataCount(yearsAgo);

    // Count how many have GF Scores
    const db = require('./server/database/db');
    const { getAllHistoricalFundamentals } = db;
    const allData = await getAllHistoricalFundamentals(yearsAgo);
    const withGFScore = allData.filter(d => d.gfScore !== null).length;

    console.log(`  ${yearsAgo}Y ago: ${count} total records, ${withGFScore} with GF Scores`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('HISTORICAL GF SCORES COLLECTION COMPLETE');
  console.log('='.repeat(80));

  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  guruFocusService.closeBrowser().finally(() => {
    process.exit(1);
  });
});
