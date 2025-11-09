const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS = 250; // 250ms = 4 requests per second (safe under 300/min limit)

/**
 * Fetch GARP metrics for a single stock from FMP API for a specific year
 */
async function fetchGARPMetricsForYear(symbol, yearsAgo) {
  try {
    // Calculate the target year
    const targetYear = new Date().getFullYear() - yearsAgo;

    // Fetch key metrics (includes P/E, Debt/Equity, etc.)
    const keyMetricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=annual&limit=10&apikey=${FMP_API_KEY}`;
    const keyMetricsResponse = await axios.get(keyMetricsUrl);

    // Find data for the target year
    const keyMetrics = keyMetricsResponse.data.find(item => {
      const itemYear = new Date(item.date).getFullYear();
      return itemYear === targetYear;
    });

    if (!keyMetrics) {
      return { success: false, symbol, yearsAgo, error: `No data for year ${targetYear}` };
    }

    // Fetch financial ratios (includes operating margin, ROIC, etc.)
    const ratiosUrl = `https://financialmodelingprep.com/api/v3/ratios/${symbol}?period=annual&limit=10&apikey=${FMP_API_KEY}`;
    const ratiosResponse = await axios.get(ratiosUrl);
    const ratios = ratiosResponse.data.find(item => {
      const itemYear = new Date(item.date).getFullYear();
      return itemYear === targetYear;
    });

    // Fetch cash flow statement (for free cash flow)
    const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=annual&limit=10&apikey=${FMP_API_KEY}`;
    const cashFlowResponse = await axios.get(cashFlowUrl);
    const cashFlow = cashFlowResponse.data.find(item => {
      const itemYear = new Date(item.date).getFullYear();
      return itemYear === targetYear;
    });

    // Extract the metrics we need
    const garpMetrics = {
      peRatio: keyMetrics?.peRatio || null,
      debtToEquity: keyMetrics?.debtToEquity || null,
      freeCashFlow: cashFlow?.freeCashFlow || null,
      operatingMargin: ratios?.operatingProfitMargin || null,
      roic: keyMetrics?.roic || null,
      pegRatio: keyMetrics?.pegRatio || null,
      fcfYield: null // Will calculate this if we have market cap and FCF
    };

    // Calculate FCF Yield if possible: (Free Cash Flow / Market Cap) * 100
    if (garpMetrics.freeCashFlow && keyMetrics?.marketCap) {
      garpMetrics.fcfYield = (garpMetrics.freeCashFlow / keyMetrics.marketCap) * 100;
    }

    return {
      success: true,
      symbol,
      yearsAgo,
      year: targetYear,
      metrics: garpMetrics
    };

  } catch (error) {
    console.error(`Error fetching GARP metrics for ${symbol} (${yearsAgo}Y ago):`, error.message);
    return {
      success: false,
      symbol,
      yearsAgo,
      error: error.message
    };
  }
}

/**
 * Update the historical_fundamentals table with GARP metrics
 */
function updateHistoricalGARPMetrics(db, symbol, yearsAgo, metrics) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE historical_fundamentals
      SET
        peRatio = ?,
        debtToEquity = ?,
        freeCashFlow = ?,
        operatingMargin = ?,
        roic = ?,
        pegRatio = ?,
        fcfYield = ?
      WHERE symbol = ? AND yearsAgo = ?
    `;

    const params = [
      metrics.peRatio,
      metrics.debtToEquity,
      metrics.freeCashFlow,
      metrics.operatingMargin,
      metrics.roic,
      metrics.pegRatio,
      metrics.fcfYield,
      symbol,
      yearsAgo
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes });
      }
    });
  });
}

/**
 * Get all stock symbols from the database
 */
function getAllStockSymbols(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT symbol FROM stocks ORDER BY symbol', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(row => row.symbol));
      }
    });
  });
}

/**
 * Delay helper function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('FETCHING HISTORICAL GARP METRICS (Years 1-5)');
  console.log('='.repeat(80));
  console.log('');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
  });

  try {
    const symbols = await getAllStockSymbols(db);
    const years = [1, 2, 3, 4, 5];

    console.log(`📊 Fetching GARP metrics for ${symbols.length} stocks × ${years.length} years = ${symbols.length * years.length} total data points`);
    console.log('');

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log('Starting fetch...\n');

    let totalProcessed = 0;
    const totalToProcess = symbols.length * years.length;

    for (const symbol of symbols) {
      for (const yearsAgo of years) {
        totalProcessed++;
        const progress = `[${totalProcessed}/${totalToProcess}]`;

        console.log(`${progress} Fetching ${symbol} (${yearsAgo}Y ago)...`);

        // Fetch GARP metrics from API
        const result = await fetchGARPMetricsForYear(symbol, yearsAgo);

        if (result.success) {
          // Update database
          try {
            await updateHistoricalGARPMetrics(db, symbol, yearsAgo, result.metrics);
            results.successful++;

            console.log(`  ✅ Year ${result.year} - P/E: ${result.metrics.peRatio?.toFixed(2) || 'N/A'}, ` +
                       `D/E: ${result.metrics.debtToEquity?.toFixed(2) || 'N/A'}, ` +
                       `ROIC: ${result.metrics.roic ? (result.metrics.roic * 100).toFixed(2) + '%' : 'N/A'}`);
          } catch (dbErr) {
            console.log(`  ❌ Database update failed: ${dbErr.message}`);
            results.failed++;
            results.errors.push({ symbol, yearsAgo, error: dbErr.message });
          }
        } else {
          results.failed++;
          results.errors.push({ symbol, yearsAgo, error: result.error });
          console.log(`  ⚠️  ${result.error}`);
        }

        // Rate limiting delay
        await delay(DELAY_BETWEEN_REQUESTS);
      }

      // Add a newline after each stock for readability
      if (totalProcessed % 5 === 0) {
        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('HISTORICAL FETCH COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`   Success Rate: ${((results.successful / totalToProcess) * 100).toFixed(2)}%`);
    console.log('');

    if (results.errors.length > 0) {
      console.log(`Errors (showing first 20):`);
      results.errors.slice(0, 20).forEach(err => {
        console.log(`  ${err.symbol} (${err.yearsAgo}Y): ${err.error}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
    });
  }
}

// Run the script
main().catch(console.error);
