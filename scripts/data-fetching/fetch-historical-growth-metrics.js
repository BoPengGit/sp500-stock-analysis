const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS = 100; // 100ms = 10 requests per second (600/min, safe under 300/min limit with 3 calls per stock)

/**
 * Get all unique symbol/year combinations from historical_fundamentals
 */
function getHistoricalRecords(db) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT symbol, yearsAgo
      FROM historical_fundamentals
      WHERE yearsAgo <= 10
      ORDER BY symbol, yearsAgo ASC
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Fetch growth metrics for a specific yearsAgo
 */
async function fetchGrowthMetricsForYear(symbol, yearsAgo) {
  try {
    // Calculate the target calendar year
    const currentYear = new Date().getFullYear();
    const targetYear = currentYear - yearsAgo;

    // Fetch income statement for EPS Growth and Revenue CAGR
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=annual&limit=5&apikey=${FMP_API_KEY}`;
    const incomeResponse = await axios.get(incomeUrl);
    const incomeHistory = incomeResponse.data;

    // Fetch cash flow statement for FCF Growth
    const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=annual&limit=5&apikey=${FMP_API_KEY}`;
    const cashFlowResponse = await axios.get(cashFlowUrl);
    const cashFlowHistory = cashFlowResponse.data;

    // Find the data for the specified year
    const targetIncome = incomeHistory.find(d => d.calendarYear === targetYear.toString());
    const targetCashFlow = cashFlowHistory.find(d => d.calendarYear === targetYear.toString());

    if (!targetIncome || !targetCashFlow) {
      return {
        success: false,
        symbol,
        yearsAgo,
        error: 'Data not found for specified year'
      };
    }

    // Get the index of the target year
    const incomeIndex = incomeHistory.findIndex(d => d.calendarYear === targetYear.toString());
    const cashFlowIndex = cashFlowHistory.findIndex(d => d.calendarYear === targetYear.toString());

    // Calculate FCF Growth (1-year growth rate)
    let fcfGrowth = null;
    if (cashFlowIndex >= 0 && cashFlowHistory[cashFlowIndex + 1]) {
      const currentFCF = cashFlowHistory[cashFlowIndex]?.freeCashFlow;
      const previousFCF = cashFlowHistory[cashFlowIndex + 1]?.freeCashFlow;
      if (currentFCF && previousFCF && previousFCF !== 0) {
        fcfGrowth = ((currentFCF - previousFCF) / Math.abs(previousFCF)) * 100;
      }
    }

    // Calculate EPS Growth (1-year growth rate)
    let epsGrowth = null;
    if (incomeIndex >= 0 && incomeHistory[incomeIndex + 1]) {
      const currentEPS = incomeHistory[incomeIndex]?.eps;
      const previousEPS = incomeHistory[incomeIndex + 1]?.eps;
      if (currentEPS && previousEPS && previousEPS !== 0) {
        epsGrowth = ((currentEPS - previousEPS) / Math.abs(previousEPS)) * 100;
      }
    }

    // Calculate Revenue CAGR (3-year CAGR if available, else use what we have)
    let revenueCagr = null;
    if (incomeIndex >= 0 && incomeHistory[incomeIndex + 3]) {
      const currentRevenue = incomeHistory[incomeIndex]?.revenue;
      const oldRevenue = incomeHistory[incomeIndex + 3]?.revenue;
      const years = 3;
      if (currentRevenue && oldRevenue && oldRevenue > 0) {
        revenueCagr = (Math.pow(currentRevenue / oldRevenue, 1 / years) - 1) * 100;
      }
    } else if (incomeIndex >= 0 && incomeHistory[incomeIndex + 1]) {
      // Fallback to 1-year growth if not enough data
      const currentRevenue = incomeHistory[incomeIndex]?.revenue;
      const previousRevenue = incomeHistory[incomeIndex + 1]?.revenue;
      if (currentRevenue && previousRevenue && previousRevenue !== 0) {
        revenueCagr = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
      }
    }

    // Calculate PEG Ratio: P/E Ratio / EPS Growth Rate
    // Need to fetch key metrics for P/E ratio
    let pegRatio = null;
    try {
      const keyMetricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=annual&apikey=${FMP_API_KEY}`;
      const keyMetricsResponse = await axios.get(keyMetricsUrl);

      // Find key metrics for the target year
      const targetKeyMetrics = keyMetricsResponse.data.find(d => d.calendarYear === targetYear.toString());

      if (targetKeyMetrics && targetKeyMetrics.peRatio && epsGrowth && epsGrowth > 0) {
        pegRatio = targetKeyMetrics.peRatio / epsGrowth;
      }
    } catch (error) {
      // If we can't fetch key metrics, leave PEG as null
      console.log(`  ⚠️  Could not fetch P/E ratio for PEG calculation: ${error.message}`);
    }

    return {
      success: true,
      symbol,
      yearsAgo,
      metrics: {
        fcfGrowth,
        epsGrowth,
        revenueCagr,
        pegRatio
      }
    };

  } catch (error) {
    console.error(`Error fetching growth metrics for ${symbol} ${yearsAgo} yearsAgo:`, error.message);
    return {
      success: false,
      symbol,
      yearsAgo,
      error: error.message
    };
  }
}

/**
 * Update historical_fundamentals with growth metrics
 */
function updateHistoricalGrowthMetrics(db, symbol, yearsAgo, metrics) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE historical_fundamentals
      SET
        fcfGrowth = ?,
        epsGrowth = ?,
        revenueCagr = ?,
        pegRatio = ?
      WHERE symbol = ? AND yearsAgo = ?
    `;

    const params = [
      metrics.fcfGrowth,
      metrics.epsGrowth,
      metrics.revenueCagr,
      metrics.pegRatio,
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
  console.log('FETCHING HISTORICAL GROWTH METRICS');
  console.log('='.repeat(80));
  console.log('');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
  });

  try {
    // Get all historical records
    const records = await getHistoricalRecords(db);
    console.log(`📊 Found ${records.length} historical records to process`);
    console.log('');

    const results = {
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Group by symbol to minimize API calls
    const symbolGroups = {};
    records.forEach(record => {
      if (!symbolGroups[record.symbol]) {
        symbolGroups[record.symbol] = [];
      }
      symbolGroups[record.symbol].push(record.yearsAgo);
    });

    const symbols = Object.keys(symbolGroups);
    console.log(`Processing ${symbols.length} unique symbols...`);
    console.log('');

    let recordsProcessed = 0;
    const totalRecords = records.length;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const yearsAgoList = symbolGroups[symbol];

      const progress = `[${i + 1}/${symbols.length}]`;
      console.log(`${progress} Fetching ${symbol} (${yearsAgoList.length} periods: ${yearsAgoList.join(', ')} yearsAgo)...`);

      // Fetch data once for all years for this symbol
      for (const yearsAgo of yearsAgoList) {
        recordsProcessed++;
        const recordProgress = `  [${recordsProcessed}/${totalRecords}]`;

        const result = await fetchGrowthMetricsForYear(symbol, yearsAgo);

        if (result.success) {
          // Update database
          try {
            await updateHistoricalGrowthMetrics(db, symbol, yearsAgo, result.metrics);
            results.successful++;

            // Display the metrics
            console.log(`${recordProgress} ${yearsAgo} yearsAgo - ✅ Success`);
            console.log(`     FCF Growth: ${result.metrics.fcfGrowth?.toFixed(2) + '%' || 'N/A'}`);
            console.log(`     EPS Growth: ${result.metrics.epsGrowth?.toFixed(2) + '%' || 'N/A'}`);
            console.log(`     Revenue CAGR: ${result.metrics.revenueCagr?.toFixed(2) + '%' || 'N/A'}`);
            console.log(`     PEG Ratio: ${result.metrics.pegRatio?.toFixed(2) || 'N/A'}`);
          } catch (dbErr) {
            console.log(`${recordProgress} ${yearsAgo} yearsAgo - ❌ Database update failed: ${dbErr.message}`);
            results.failed++;
            results.errors.push({ symbol, yearsAgo, error: dbErr.message });
          }
        } else {
          results.failed++;
          results.errors.push({ symbol, yearsAgo, error: result.error });
          console.log(`${recordProgress} ${yearsAgo} yearsAgo - ❌ API fetch failed: ${result.error}`);
        }

        // Rate limiting delay - only between different symbols, not between years of the same symbol
        if (yearsAgoList.indexOf(yearsAgo) === yearsAgoList.length - 1 && i < symbols.length - 1) {
          await delay(DELAY_BETWEEN_REQUESTS);
        }
      }

      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('FETCH COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);
    console.log('');

    if (results.errors.length > 0 && results.errors.length <= 20) {
      console.log('Errors:');
      results.errors.forEach(err => {
        console.log(`  ${err.symbol} ${err.yearsAgo} yearsAgo: ${err.error}`);
      });
      console.log('');
    } else if (results.errors.length > 20) {
      console.log(`Too many errors to display (${results.errors.length} total)`);
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
