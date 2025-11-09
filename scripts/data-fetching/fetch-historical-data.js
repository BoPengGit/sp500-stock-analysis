#!/usr/bin/env node

// Load environment variables FIRST
require('dotenv').config();

/**
 * Fetch Historical Data Script
 *
 * Fetches historical data (1 year ago) for all S&P 500 stocks:
 * - Market Cap
 * - ADTV (Average Daily Trading Volume)
 * - P/S Ratio (Price-to-Sales)
 * - Sales Growth
 * - GF Score (from GuruFocus)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const historicalDataService = require('./server/services/historicalDataService');
const {SP500_TICKERS} = require('./server/config/sp500-tickers');

const dbPath = path.join(__dirname, 'data/stocks.db');

/**
 * Update historical data in database
 */
function saveHistoricalDataToDB(db, data) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE stocks
      SET marketCap_1y_ago = ?, adtv_1y_ago = ?, priceToSales_1y_ago = ?, salesGrowth_1y_ago = ?
      WHERE symbol = ?
    `, [
      data.marketCap_1y_ago,
      data.adtv_1y_ago,
      data.priceToSales_1y_ago,
      data.salesGrowth_1y_ago,
      data.symbol
    ], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Fetch historical GF Score for a symbol (would need to be scraped from GuruFocus)
 * For now, we'll return null and this can be implemented later
 */
async function fetchHistoricalGFScore(symbol) {
  // TODO: Implement historical GF Score scraping
  // This would require accessing historical GuruFocus data
  // which may not be available through standard APIs
  return null;
}

/**
 * Main function
 */
async function main() {
  console.log('=== Fetching Historical Data (1 Year Ago) ===\n');
  const startTime = Date.now();

  // Connect to database
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
    console.log('Connected to SQLite database\n');
  });

  // Get all symbols from database
  db.all('SELECT symbol FROM stocks ORDER BY symbol', async (err, rows) => {
    if (err) {
      console.error('Error fetching symbols:', err);
      process.exit(1);
    }

    const symbols = rows.map(row => row.symbol);
    console.log(`Found ${symbols.length} stocks in database`);
    console.log(`Fetching historical data for all stocks...\n`);

    let successCount = 0;
    let errorCount = 0;

    // Process stocks in batches to avoid rate limiting
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];

      try {
        console.log(`[${i + 1}/${symbols.length}] Fetching ${symbol}...`);

        // Fetch historical data from FMP API
        const historicalData = await historicalDataService.fetchHistoricalStockData(symbol);

        // Save to database
        await saveHistoricalDataToDB(db, historicalData);

        console.log(`  ✓ Saved: MC=$${(historicalData.marketCap_1y_ago/1e9).toFixed(2)}B, ADTV=${(historicalData.adtv_1y_ago/1e6).toFixed(2)}M, P/S=${historicalData.priceToSales_1y_ago?.toFixed(2)}, SG=${historicalData.salesGrowth_1y_ago?.toFixed(2)}%`);
        successCount++;

      } catch (error) {
        console.error(`  ✗ Error fetching ${symbol}:`, error.message);
        errorCount++;
      }

      // Rate limiting: 200ms delay between requests (5 requests per second)
      if (i < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Progress update every 50 stocks
      if ((i + 1) % 50 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const remaining = Math.round((elapsed / (i + 1)) * (symbols.length - i - 1));
        console.log(`\nProgress: ${i + 1}/${symbols.length} (${Math.round((i + 1) / symbols.length * 100)}%)`);
        console.log(`Elapsed: ${elapsed}s | Est. remaining: ${remaining}s\n`);
      }
    }

    // Close database
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }

      const endTime = Date.now();
      const durationSeconds = Math.round((endTime - startTime) / 1000);
      const durationMinutes = Math.round(durationSeconds / 60);

      console.log('\n=== Historical Data Fetch Complete ===');
      console.log(`Total duration: ${durationMinutes} minutes (${durationSeconds} seconds)`);
      console.log(`Success: ${successCount} stocks`);
      console.log(`Errors: ${errorCount} stocks`);
      console.log('\nHistorical data (1 year ago) has been added to the database!');
      console.log('Columns added: marketCap_1y_ago, adtv_1y_ago, priceToSales_1y_ago, salesGrowth_1y_ago\n');

      process.exit(0);
    });
  });
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
