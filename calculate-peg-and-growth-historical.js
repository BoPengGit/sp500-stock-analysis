/**
 * Calculate PEG Ratio and Growth Metrics for Historical Data (5 Years)
 *
 * For each year (0-5 years ago):
 * 1. Fetch fundamental data for that year
 * 2. Calculate growth metrics (FCF Growth, EPS Growth, Revenue CAGR)
 * 3. Calculate PEG Ratio = PE / EPS Growth
 * 4. Store in database with all metrics
 */

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

const FMP_API_KEY = process.env.FMP_API_KEY || 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const db = new sqlite3.Database('./stock_data.db');

/**
 * Create tables for historical data with growth metrics
 */
function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Historical fundamentals with all metrics including PEG
      db.run(`
        CREATE TABLE IF NOT EXISTS historical_fundamentals (
          symbol TEXT NOT NULL,
          years_ago INTEGER NOT NULL,
          date TEXT,
          market_cap REAL,
          adtv REAL,
          price_to_sales REAL,
          sales_growth REAL,
          gf_score INTEGER,
          pe_ratio REAL,
          debt_to_equity REAL,
          operating_margin REAL,
          roic REAL,
          fcf_yield REAL,
          fcf_growth REAL,
          eps_growth REAL,
          revenue_cagr REAL,
          peg_ratio REAL,
          raw_data TEXT,
          PRIMARY KEY (symbol, years_ago)
        )
      `, (err) => {
        if (err) reject(err);
        else {
          console.log('✓ Created historical_fundamentals table');
          resolve();
        }
      });
    });
  });
}

/**
 * Calculate growth rate between two values
 */
function calculateGrowth(currentValue, previousValue) {
  if (!currentValue || !previousValue || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 */
function calculateCAGR(endValue, startValue, years) {
  if (!endValue || !startValue || startValue === 0 || years === 0) return null;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * Fetch fundamental data for a specific date
 */
async function fetchFundamentalsForDate(symbol, date) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}`,
      {
        params: {
          apikey: FMP_API_KEY,
          limit: 10
        },
        timeout: 10000
      }
    );

    if (!response.data || response.data.length === 0) return null;

    // Find the data closest to our target date
    const targetDate = new Date(date);
    let closestData = null;
    let closestDiff = Infinity;

    for (const item of response.data) {
      const itemDate = new Date(item.date);
      const diff = Math.abs(targetDate - itemDate);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestData = item;
      }
    }

    return closestData;
  } catch (error) {
    console.error(`Error fetching fundamentals for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch historical income statement data for growth calculations
 */
async function fetchIncomeStatement(symbol) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/income-statement/${symbol}`,
      {
        params: {
          apikey: FMP_API_KEY,
          limit: 10
        },
        timeout: 10000
      }
    );

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching income statement for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch historical cash flow data for FCF calculations
 */
async function fetchCashFlow(symbol) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}`,
      {
        params: {
          apikey: FMP_API_KEY,
          limit: 10
        },
        timeout: 10000
      }
    );

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching cash flow for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Calculate all metrics for a specific year
 */
async function calculateMetricsForYear(symbol, yearsAgo) {
  try {
    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);
    const dateStr = targetDate.toISOString().split('T')[0];

    console.log(`  Calculating metrics for ${yearsAgo}Y ago (${dateStr})...`);

    // Fetch fundamental data
    const fundamentals = await fetchFundamentalsForDate(symbol, dateStr);
    if (!fundamentals) {
      console.log(`  ⚠️  No fundamental data found`);
      return null;
    }

    // Fetch historical data for growth calculations
    const [incomeStatements, cashFlows] = await Promise.all([
      fetchIncomeStatement(symbol),
      fetchCashFlow(symbol)
    ]);

    // Find data for current year and previous year
    const currentData = incomeStatements.find(item =>
      Math.abs(new Date(item.date) - targetDate) < 365 * 24 * 60 * 60 * 1000
    );

    const previousYearDate = new Date(targetDate);
    previousYearDate.setFullYear(previousYearDate.getFullYear() - 1);
    const previousData = incomeStatements.find(item =>
      Math.abs(new Date(item.date) - previousYearDate) < 365 * 24 * 60 * 60 * 1000
    );

    // Calculate growth metrics
    let fcfGrowth = null;
    let epsGrowth = null;
    let revenueCagr = null;

    if (currentData && previousData) {
      // EPS Growth (year-over-year)
      epsGrowth = calculateGrowth(currentData.eps, previousData.eps);

      // Revenue CAGR (we'll use 1-year growth for now, or calculate multi-year if data available)
      revenueCagr = calculateGrowth(currentData.revenue, previousData.revenue);
    }

    // FCF Growth
    const currentCF = cashFlows.find(item =>
      Math.abs(new Date(item.date) - targetDate) < 365 * 24 * 60 * 60 * 1000
    );
    const previousCF = cashFlows.find(item =>
      Math.abs(new Date(item.date) - previousYearDate) < 365 * 24 * 60 * 60 * 1000
    );

    if (currentCF && previousCF) {
      fcfGrowth = calculateGrowth(currentCF.freeCashFlow, previousCF.freeCashFlow);
    }

    // Calculate PEG Ratio = PE / EPS Growth Rate
    // EPS Growth is in percentage, so divide by 100 to get growth rate
    // PEG = PE / (EPS Growth % / 100) = PE / EPS Growth * 100
    // Actually simpler: PEG = PE / EPS Growth (when EPS Growth is in percentage)
    // Standard formula: if EPS growing at 15% and PE is 30, PEG = 30/15 = 2.0
    let pegRatio = null;
    if (fundamentals.peRatio && epsGrowth && epsGrowth > 0) {
      pegRatio = fundamentals.peRatio / epsGrowth;
    }

    // Extract all fundamental metrics
    const metrics = {
      symbol,
      yearsAgo,
      date: fundamentals.date,
      marketCap: fundamentals.marketCap,
      adtv: null, // ADTV requires historical price data, will handle separately
      priceToSales: fundamentals.priceToSalesRatio,
      salesGrowth: fundamentals.revenuePerShareGrowth,
      gfScore: null, // GuruFocus score not available in FMP
      peRatio: fundamentals.peRatio,
      debtToEquity: fundamentals.debtToEquity,
      operatingMargin: null, // Calculate from income statement
      roic: fundamentals.roic,
      fcfYield: fundamentals.freeCashFlowYield,
      fcfGrowth,
      epsGrowth,
      revenueCagr,
      pegRatio,
      rawData: JSON.stringify(fundamentals)
    };

    // Calculate operating margin if we have income statement data
    if (currentData && currentData.operatingIncome && currentData.revenue && currentData.revenue !== 0) {
      metrics.operatingMargin = currentData.operatingIncome / currentData.revenue;
    }

    return metrics;
  } catch (error) {
    console.error(`Error calculating metrics for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Save metrics to database
 */
function saveMetrics(metrics) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO historical_fundamentals (
        symbol, years_ago, date, market_cap, adtv, price_to_sales, sales_growth,
        gf_score, pe_ratio, debt_to_equity, operating_margin, roic, fcf_yield,
        fcf_growth, eps_growth, revenue_cagr, peg_ratio, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      metrics.symbol,
      metrics.yearsAgo,
      metrics.date,
      metrics.marketCap,
      metrics.adtv,
      metrics.priceToSales,
      metrics.salesGrowth,
      metrics.gfScore,
      metrics.peRatio,
      metrics.debtToEquity,
      metrics.operatingMargin,
      metrics.roic,
      metrics.fcfYield,
      metrics.fcfGrowth,
      metrics.epsGrowth,
      metrics.revenueCagr,
      metrics.pegRatio,
      metrics.rawData
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('═'.repeat(80));
  console.log('CALCULATING PEG RATIO & GROWTH METRICS FOR HISTORICAL DATA');
  console.log('═'.repeat(80));
  console.log(`Processing ${SP500_TICKERS.length} S&P 500 companies`);
  console.log(`Time periods: 1-6 years ago (6 years total)`);
  console.log(`Metrics: FCF Growth, EPS Growth, Revenue CAGR, PEG Ratio`);
  console.log('═'.repeat(80));
  console.log();

  // Create tables
  await createTables();

  let processed = 0;
  let saved = 0;
  let errors = 0;

  // Process each company
  for (const symbol of SP500_TICKERS) {
    console.log(`\n[${processed + 1}/${SP500_TICKERS.length}] Processing ${symbol}...`);

    // Process each year (1-6 years ago)
    for (let yearsAgo = 1; yearsAgo <= 6; yearsAgo++) {
      try {
        const metrics = await calculateMetricsForYear(symbol, yearsAgo);

        if (metrics) {
          await saveMetrics(metrics);
          saved++;
          console.log(`  ✓ Saved ${yearsAgo}Y ago - PEG: ${metrics.pegRatio?.toFixed(2) || 'N/A'}`);
        }

        // Rate limiting: 300 requests/minute = 5 req/sec
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        console.error(`  ✗ Error for ${yearsAgo}Y ago:`, error.message);
        errors++;
      }
    }

    processed++;

    // Progress report every 10 companies
    if (processed % 10 === 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Progress: ${processed}/${SP500_TICKERS.length} companies`);
      console.log(`Saved: ${saved} | Errors: ${errors}`);
      console.log(`${'='.repeat(60)}\n`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('CALCULATION COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Total companies processed: ${processed}`);
  console.log(`Total records saved: ${saved}`);
  console.log(`Total errors: ${errors}`);
  console.log('═'.repeat(80));

  db.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
