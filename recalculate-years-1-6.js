const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const { SP500_TICKERS } = require('./server/config/sp500-tickers');

const FMP_API_KEY = process.env.FMP_API_KEY;
const DB_PATH = path.join(__dirname, 'stock_data.db');

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS = 300; // 300ms = ~3.3 symbols/sec = ~200 symbols/min = ~600 API calls/min

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
        fcf_growth = ?,
        eps_growth = ?,
        revenue_cagr = ?,
        peg_ratio = ?
      WHERE symbol = ? AND years_ago = ?
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
  console.log('RECALCULATING YEARS 1-6 WITH CORRECT GROWTH METRICS');
  console.log('='.repeat(80));
  console.log('');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
  });

  try {
    // Get stocks that already exist in historical_fundamentals for Years 1-6
    const getExistingStocksQuery = `
      SELECT DISTINCT symbol
      FROM historical_fundamentals
      WHERE years_ago BETWEEN 1 AND 6
      ORDER BY symbol
    `;

    const symbols = await new Promise((resolve, reject) => {
      db.all(getExistingStocksQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.symbol));
      });
    });

    console.log(`📊 Processing ${symbols.length} stocks that exist in Years 1-6`);
    console.log('');

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    let totalProcessed = 0;
    const totalRecords = symbols.length * 6; // 6 years

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];

      const progress = `[${i + 1}/${symbols.length}]`;
      console.log(`${progress} ${symbol}...`);

      // Fetch data for Years 1-6
      for (const yearsAgo of [1, 2, 3, 4, 5, 6]) {
        totalProcessed++;
        const recordProgress = `  [${totalProcessed}/${totalRecords}]`;

        const result = await fetchGrowthMetricsForYear(symbol, yearsAgo);

        if (result.success) {
          // Update database
          try {
            await updateHistoricalGrowthMetrics(db, symbol, yearsAgo, result.metrics);
            results.successful++;

            // Compact display
            const metrics = [];
            if (result.metrics.fcfGrowth !== null) metrics.push(`FCF: ${result.metrics.fcfGrowth.toFixed(1)}%`);
            if (result.metrics.epsGrowth !== null) metrics.push(`EPS: ${result.metrics.epsGrowth.toFixed(1)}%`);
            if (result.metrics.revenueCagr !== null) metrics.push(`Rev: ${result.metrics.revenueCagr.toFixed(1)}%`);
            if (result.metrics.pegRatio !== null) metrics.push(`PEG: ${result.metrics.pegRatio.toFixed(2)}`);

            console.log(`${recordProgress} Year ${yearsAgo} ✅ ${metrics.join(', ') || 'No data'}`);
          } catch (dbErr) {
            console.log(`${recordProgress} Year ${yearsAgo} ❌ DB error: ${dbErr.message}`);
            results.failed++;
            results.errors.push({ symbol, yearsAgo, error: dbErr.message });
          }
        } else {
          results.failed++;
          results.errors.push({ symbol, yearsAgo, error: result.error });
          console.log(`${recordProgress} Year ${yearsAgo} ❌ ${result.error}`);
        }

        // Rate limiting delay
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    }

    // Summary
    console.log('\\n' + '='.repeat(80));
    console.log('CALCULATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Total Processed: ${totalProcessed}/${totalRecords}`);
    console.log('');

    if (results.errors.length > 0 && results.errors.length <= 20) {
      console.log('Errors:');
      results.errors.forEach(err => {
        console.log(`  ${err.symbol} Year ${err.yearsAgo}: ${err.error}`);
      });
    } else if (results.errors.length > 20) {
      console.log(`⚠️  ${results.errors.length} errors (too many to display)`);
    }

    // Now shift Years 1-6 → Years 0-5
    console.log('\\n' + '='.repeat(80));
    console.log('SHIFTING YEARS 1-6 → YEARS 0-5');
    console.log('='.repeat(80));

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Create temp table with shifted data
        db.run(`
          CREATE TEMP TABLE year_shift AS
          SELECT
            symbol, years_ago - 1 AS new_years_ago, date, market_cap, adtv,
            price_to_sales, sales_growth, gf_score, pe_ratio, debt_to_equity,
            operating_margin, roic, fcf_yield, fcf_growth, eps_growth,
            revenue_cagr, peg_ratio, raw_data
          FROM historical_fundamentals
          WHERE years_ago BETWEEN 1 AND 6
        `);

        // Delete Years 1-6
        db.run(`DELETE FROM historical_fundamentals WHERE years_ago BETWEEN 1 AND 6`);

        // Insert as Years 0-5
        db.run(`
          INSERT INTO historical_fundamentals (
            symbol, years_ago, date, market_cap, adtv, price_to_sales, sales_growth,
            gf_score, pe_ratio, debt_to_equity, operating_margin, roic, fcf_yield,
            fcf_growth, eps_growth, revenue_cagr, peg_ratio, raw_data
          )
          SELECT
            symbol, new_years_ago, date, market_cap, adtv, price_to_sales, sales_growth,
            gf_score, pe_ratio, debt_to_equity, operating_margin, roic, fcf_yield,
            fcf_growth, eps_growth, revenue_cagr, peg_ratio, raw_data
          FROM year_shift
        `, (err) => {
          if (err) reject(err);
          else {
            console.log('✅ Shift complete! Years 1-6 are now Years 0-5');
            resolve();
          }
        });
      });
    });

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
