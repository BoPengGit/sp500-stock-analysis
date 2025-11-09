/**
 * Fetch All Historical GF Scores
 *
 * Scrapes historical GF Scores for ALL S&P 500 stocks for the past 5 years
 * Saves incrementally to database with progress tracking and error recovery
 *
 * WARNING: This will take several hours due to web scraping delays (5-10 seconds per stock/year)
 * Total operations: 502 stocks × 5 years = 2,510 scraping operations
 * Estimated time: 3-5 hours
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

const YEARS_TO_FETCH = [1, 2, 3, 4, 5]; // Years ago to fetch GF Scores for
const DELAY_BETWEEN_SCRAPES = 8000; // 8 seconds between scrapes (conservative to avoid blocking)
const BATCH_SIZE = 10; // Process 10 stocks at a time, then take a longer break
const BATCH_DELAY = 30000; // 30 second break between batches

async function main() {
  console.log('================================================================================');
  console.log('COMPREHENSIVE HISTORICAL GF SCORES COLLECTION');
  console.log('================================================================================');
  console.log(`Total Stocks: ${SP500_TICKERS.length}`);
  console.log(`Years to Fetch: ${YEARS_TO_FETCH.join(', ')} years ago`);
  console.log(`Total Scraping Operations: ${SP500_TICKERS.length * YEARS_TO_FETCH.length}`);
  console.log(`Estimated Time: 3-5 hours`);
  console.log('================================================================================\n');

  // Initialize database
  await initializeDatabase();

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Process each year
  for (const yearsAgo of YEARS_TO_FETCH) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`FETCHING HISTORICAL GF SCORES FROM ${yearsAgo} YEARS AGO`);
    console.log(`${'='.repeat(80)}\n`);

    let yearSuccess = 0;
    let yearFailed = 0;
    let yearSkipped = 0;
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
          // Check if we already have GF Score for this stock/year
          const existingData = await getHistoricalFundamental(symbol, yearsAgo);
          if (existingData && existingData.gfScore !== null) {
            yearSkipped++;
            console.log(`⊙ ${symbol}: GF Score already in database (skipped)`);
            continue;
          }

          // Scrape historical GF Score
          console.log(`→ ${symbol}: Scraping GF Score for ${yearsAgo}Y ago...`);
          const gfData = await guruFocusService.getHistoricalStockRanking(symbol, yearsAgo);

          if (gfData && gfData.gfScore !== null) {
            // Update or create the historical fundamental record with GF Score
            const recordToSave = existingData ? {
              ...existingData,
              gfScore: gfData.gfScore
            } : {
              symbol: symbol,
              yearsAgo: yearsAgo,
              marketCap: null,
              adtv: null,
              priceToSales: null,
              salesGrowth: null,
              gfScore: gfData.gfScore,
              date: gfData.date
            };

            await saveHistoricalFundamental(recordToSave);
            yearSuccess++;
            console.log(`✓ ${symbol}: GF Score = ${gfData.gfScore} for ${yearsAgo}Y ago (saved)`);
          } else {
            yearFailed++;
            failedSymbols.push(symbol);
            console.log(`✗ ${symbol}: No GF Score found for ${yearsAgo}Y ago`);
          }

          // Wait before next scrape (except for last one in batch)
          if (symbol !== batch[batch.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SCRAPES));
          }
        } catch (error) {
          yearFailed++;
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
      console.log(`Success: ${yearSuccess} | Failed: ${yearFailed} | Skipped: ${yearSkipped}`);

      // Wait before next batch (except for last batch)
      if (i + BATCH_SIZE < SP500_TICKERS.length) {
        console.log(`\nWaiting ${BATCH_DELAY / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Summary for this year
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${yearsAgo}Y AGO GF SCORES COLLECTION COMPLETE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Success: ${yearSuccess} | Failed: ${yearFailed} | Skipped: ${yearSkipped}`);
    if (failedSymbols.length > 0) {
      console.log(`Failed symbols: ${failedSymbols.join(', ')}`);
    }
    console.log('');

    totalSuccess += yearSuccess;
    totalFailed += yearFailed;
    totalSkipped += yearSkipped;
  }

  // Close GuruFocus browser
  await guruFocusService.closeBrowser();

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY - ALL HISTORICAL GF SCORES');
  console.log('='.repeat(80));
  console.log(`Total Success: ${totalSuccess}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log(`Total Skipped: ${totalSkipped}`);
  console.log(`Total Operations: ${totalSuccess + totalFailed + totalSkipped}`);
  console.log('='.repeat(80));

  // Show final database status
  console.log('\nVerifying database...');
  for (const yearsAgo of YEARS_TO_FETCH) {
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
