/**
 * Comprehensive Historical Data Collection Script
 *
 * Fetches historical fundamentals for ALL S&P 500 stocks for the past 5 years
 * Saves incrementally to database with progress tracking and error recovery
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { SP500_TICKERS } = require('./server/config/sp500-tickers');
const stockDataService = require('./server/services/stockDataService');
const {
  initializeDatabase,
  saveHistoricalFundamental,
  hasHistoricalData,
  getHistoricalDataCount
} = require('./server/database/db');

const YEARS_TO_FETCH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Years ago to fetch data for
const BATCH_SIZE = 50; // Number of stocks per batch
const BATCH_DELAY = 5000; // 5 seconds between batches (~600 calls/min - using 85% of 700 calls/min limit)

async function main() {
  console.log('================================================================================');
  console.log('COMPREHENSIVE HISTORICAL DATA COLLECTION');
  console.log('================================================================================');
  console.log(`Total Stocks: ${SP500_TICKERS.length}`);
  console.log(`Years to Fetch: ${YEARS_TO_FETCH.join(', ')} years ago`);
  console.log(`Total Data Points: ${SP500_TICKERS.length * YEARS_TO_FETCH.length}`);
  console.log('================================================================================\n');

  // Initialize database
  await initializeDatabase();

  // Show current data counts
  console.log('\nCurrent Database Status:');
  for (const yearsAgo of YEARS_TO_FETCH) {
    const count = await getHistoricalDataCount(yearsAgo);
    console.log(`  ${yearsAgo}Y ago: ${count}/${SP500_TICKERS.length} stocks`);
  }
  console.log('');

  // Process each year
  for (const yearsAgo of YEARS_TO_FETCH) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`FETCHING DATA FROM ${yearsAgo} YEARS AGO`);
    console.log(`${'='.repeat(80)}\n`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
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
          // Check if we already have data for this stock/year
          const exists = await hasHistoricalData(symbol, yearsAgo);
          if (exists) {
            skippedCount++;
            console.log(`⊙ ${symbol}: Already in database (skipped)`);
            continue;
          }

          // Fetch historical fundamentals
          console.log(`→ ${symbol}: Fetching...`);
          const data = await stockDataService.getHistoricalFundamentals(symbol, yearsAgo);

          if (data && (data.marketCap || data.adtv || data.priceToSales || data.salesGrowth || data.gfScore)) {
            // Save to database
            await saveHistoricalFundamental({
              symbol: symbol,
              yearsAgo: yearsAgo,
              marketCap: data.marketCap,
              adtv: data.adtv,
              priceToSales: data.priceToSales,
              salesGrowth: data.salesGrowth,
              gfScore: data.gfScore,
              date: data.date
            });

            successCount++;
            console.log(`✓ ${symbol}: Saved (MC: ${data.marketCap ? 'Y' : 'N'}, ADTV: ${data.adtv ? 'Y' : 'N'}, P/S: ${data.priceToSales ? 'Y' : 'N'}, SG: ${data.salesGrowth ? 'Y' : 'N'}, GF: ${data.gfScore ? 'Y' : 'N'})`);
          } else {
            failCount++;
            failedSymbols.push(symbol);
            console.log(`✗ ${symbol}: No data available`);
          }
        } catch (error) {
          failCount++;
          failedSymbols.push(symbol);
          console.error(`✗ ${symbol}: Error - ${error.message}`);
        }
      }

      // Progress summary for this batch
      const processed = Math.min(i + BATCH_SIZE, SP500_TICKERS.length);
      console.log(`\nBatch ${batchNum} Complete: ${processed}/${SP500_TICKERS.length} stocks processed`);
      console.log(`Success: ${successCount} | Failed: ${failCount} | Skipped: ${skippedCount}`);

      // Wait before next batch (except for last batch)
      if (i + BATCH_SIZE < SP500_TICKERS.length) {
        console.log(`\nWaiting ${BATCH_DELAY / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Summary for this year
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${yearsAgo}Y AGO DATA COLLECTION COMPLETE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Success: ${successCount} | Failed: ${failCount} | Skipped: ${skippedCount}`);
    if (failedSymbols.length > 0) {
      console.log(`Failed symbols: ${failedSymbols.join(', ')}`);
    }
    console.log('');
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL DATABASE STATUS');
  console.log('='.repeat(80));
  for (const yearsAgo of YEARS_TO_FETCH) {
    const count = await getHistoricalDataCount(yearsAgo);
    const percentage = ((count / SP500_TICKERS.length) * 100).toFixed(1);
    console.log(`  ${yearsAgo}Y ago: ${count}/${SP500_TICKERS.length} stocks (${percentage}%)`);
  }
  console.log('\n' + '='.repeat(80));
  console.log('DATA COLLECTION COMPLETE');
  console.log('='.repeat(80));

  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
