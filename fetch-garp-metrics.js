const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

// Test mode - only fetch for a few stocks first
const TEST_MODE = false;
const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'];

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS = 250; // 250ms = 4 requests per second (safe under 300/min limit)

/**
 * Fetch GARP metrics for a single stock from FMP API
 */
async function fetchGARPMetrics(symbol) {
  try {
    // Fetch key metrics (includes P/E, Debt/Equity, etc.)
    const keyMetricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=annual&apikey=${FMP_API_KEY}`;
    const keyMetricsResponse = await axios.get(keyMetricsUrl);
    const keyMetrics = keyMetricsResponse.data[0]; // Most recent annual data

    // Fetch financial ratios (includes operating margin, ROIC, etc.)
    const ratiosUrl = `https://financialmodelingprep.com/api/v3/ratios/${symbol}?period=annual&apikey=${FMP_API_KEY}`;
    const ratiosResponse = await axios.get(ratiosUrl);
    const ratios = ratiosResponse.data[0]; // Most recent annual data

    // Fetch cash flow statement (for free cash flow and FCF growth)
    const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=annual&limit=5&apikey=${FMP_API_KEY}`;
    const cashFlowResponse = await axios.get(cashFlowUrl);
    const cashFlow = cashFlowResponse.data[0]; // Most recent annual data
    const cashFlowHistory = cashFlowResponse.data; // Last 5 years for growth calculation

    // Fetch income statement (for EPS and revenue growth)
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=annual&limit=5&apikey=${FMP_API_KEY}`;
    const incomeResponse = await axios.get(incomeUrl);
    const incomeHistory = incomeResponse.data; // Last 5 years

    // Calculate FCF Growth (1-year growth rate)
    let fcfGrowth = null;
    if (cashFlowHistory.length >= 2) {
      const currentFCF = cashFlowHistory[0]?.freeCashFlow;
      const previousFCF = cashFlowHistory[1]?.freeCashFlow;
      if (currentFCF && previousFCF && previousFCF !== 0) {
        fcfGrowth = ((currentFCF - previousFCF) / Math.abs(previousFCF)) * 100;
      }
    }

    // Calculate EPS Growth (1-year growth rate)
    let epsGrowth = null;
    if (incomeHistory.length >= 2) {
      const currentEPS = incomeHistory[0]?.eps;
      const previousEPS = incomeHistory[1]?.eps;
      if (currentEPS && previousEPS && previousEPS !== 0) {
        epsGrowth = ((currentEPS - previousEPS) / Math.abs(previousEPS)) * 100;
      }
    }

    // Calculate Revenue CAGR (3-year CAGR if available, else use what we have)
    let revenueCagr = null;
    if (incomeHistory.length >= 4) {
      const currentRevenue = incomeHistory[0]?.revenue;
      const oldRevenue = incomeHistory[3]?.revenue;
      const years = 3;
      if (currentRevenue && oldRevenue && oldRevenue > 0) {
        revenueCagr = (Math.pow(currentRevenue / oldRevenue, 1 / years) - 1) * 100;
      }
    } else if (incomeHistory.length >= 2) {
      // Fallback to 1-year growth if not enough data
      const currentRevenue = incomeHistory[0]?.revenue;
      const previousRevenue = incomeHistory[1]?.revenue;
      if (currentRevenue && previousRevenue && previousRevenue !== 0) {
        revenueCagr = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
      }
    }

    // Extract the metrics we need
    const garpMetrics = {
      peRatio: keyMetrics?.peRatio || null,
      debtToEquity: keyMetrics?.debtToEquity || null,
      freeCashFlow: cashFlow?.freeCashFlow || null,
      operatingMargin: ratios?.operatingProfitMargin || null,
      roic: keyMetrics?.roic || null,
      pegRatio: keyMetrics?.pegRatio || null,
      fcfYield: null, // Will calculate this if we have market cap and FCF
      fcfGrowth: fcfGrowth,
      epsGrowth: epsGrowth,
      revenueCagr: revenueCagr
    };

    // Calculate FCF Yield if possible: (Free Cash Flow / Market Cap) * 100
    if (garpMetrics.freeCashFlow && keyMetrics?.marketCap) {
      garpMetrics.fcfYield = (garpMetrics.freeCashFlow / keyMetrics.marketCap) * 100;
    }

    // Calculate PEG Ratio if not provided by API: P/E Ratio / EPS Growth Rate
    if (!garpMetrics.pegRatio && garpMetrics.peRatio && epsGrowth && epsGrowth > 0) {
      garpMetrics.pegRatio = garpMetrics.peRatio / epsGrowth;
    }

    return {
      success: true,
      symbol,
      metrics: garpMetrics,
      rawData: {
        keyMetrics,
        ratios,
        cashFlow
      }
    };

  } catch (error) {
    console.error(`Error fetching GARP metrics for ${symbol}:`, error.message);
    return {
      success: false,
      symbol,
      error: error.message
    };
  }
}

/**
 * Update the stocks table with GARP metrics
 */
function updateStockGARPMetrics(db, symbol, metrics) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE stocks
      SET
        peRatio = ?,
        debtToEquity = ?,
        freeCashFlow = ?,
        operatingMargin = ?,
        roic = ?,
        pegRatio = ?,
        fcfYield = ?,
        fcfGrowth = ?,
        epsGrowth = ?,
        revenueCagr = ?
      WHERE symbol = ?
    `;

    const params = [
      metrics.peRatio,
      metrics.debtToEquity,
      metrics.freeCashFlow,
      metrics.operatingMargin,
      metrics.roic,
      metrics.pegRatio,
      metrics.fcfYield,
      metrics.fcfGrowth,
      metrics.epsGrowth,
      metrics.revenueCagr,
      symbol
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
  console.log('FETCHING GARP METRICS FOR STOCKS');
  console.log('='.repeat(80));
  console.log('');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
  });

  try {
    // Get symbols to fetch
    let symbols;
    if (TEST_MODE) {
      symbols = TEST_SYMBOLS;
      console.log(`🧪 TEST MODE: Fetching metrics for ${symbols.length} test stocks:`);
      console.log(`   ${symbols.join(', ')}`);
    } else {
      symbols = await getAllStockSymbols(db);
      console.log(`📊 PRODUCTION MODE: Fetching metrics for ${symbols.length} stocks`);
    }
    console.log('');

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log('Starting fetch...\n');

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const progress = `[${i + 1}/${symbols.length}]`;

      console.log(`${progress} Fetching ${symbol}...`);

      // Fetch GARP metrics from API
      const result = await fetchGARPMetrics(symbol);

      if (result.success) {
        // Update database
        try {
          await updateStockGARPMetrics(db, symbol, result.metrics);
          results.successful++;

          // Display the metrics
          console.log(`  ✅ Success - Metrics:`);
          console.log(`     P/E: ${result.metrics.peRatio?.toFixed(2) || 'N/A'}`);
          console.log(`     Debt/Equity: ${result.metrics.debtToEquity?.toFixed(2) || 'N/A'}`);
          console.log(`     FCF: $${result.metrics.freeCashFlow ? (result.metrics.freeCashFlow / 1e9).toFixed(2) + 'B' : 'N/A'}`);
          console.log(`     Operating Margin: ${result.metrics.operatingMargin ? (result.metrics.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}`);
          console.log(`     ROIC: ${result.metrics.roic ? (result.metrics.roic * 100).toFixed(2) + '%' : 'N/A'}`);
          console.log(`     PEG Ratio: ${result.metrics.pegRatio?.toFixed(2) || 'N/A'}`);
          console.log(`     FCF Yield: ${result.metrics.fcfYield?.toFixed(2) + '%' || 'N/A'}`);
          console.log(`     FCF Growth: ${result.metrics.fcfGrowth?.toFixed(2) + '%' || 'N/A'}`);
          console.log(`     EPS Growth: ${result.metrics.epsGrowth?.toFixed(2) + '%' || 'N/A'}`);
          console.log(`     Revenue CAGR: ${result.metrics.revenueCagr?.toFixed(2) + '%' || 'N/A'}`);
        } catch (dbErr) {
          console.log(`  ❌ Database update failed: ${dbErr.message}`);
          results.failed++;
          results.errors.push({ symbol, error: dbErr.message });
        }
      } else {
        results.failed++;
        results.errors.push({ symbol, error: result.error });
        console.log(`  ❌ API fetch failed: ${result.error}`);
      }

      console.log('');

      // Rate limiting delay
      if (i < symbols.length - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('FETCH COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('');

    if (results.errors.length > 0) {
      console.log('Errors:');
      results.errors.forEach(err => {
        console.log(`  ${err.symbol}: ${err.error}`);
      });
      console.log('');
    }

    if (TEST_MODE) {
      console.log('🧪 TEST MODE COMPLETE!');
      console.log('');
      console.log('To run for ALL stocks, edit this file and set:');
      console.log('  TEST_MODE = false');
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
