/**
 * Populate Year 0 (Current Year) Data in historical_fundamentals
 *
 * Fetches current stock data from FMP API and inserts it as years_ago=0
 * This allows calculating 5-year returns (Year 5 → Year 0)
 */

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const FMP_API_KEY = process.env.FMP_API_KEY || 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const DB_PATH = path.join(__dirname, '../../stock_data.db');
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

// S&P 500 tickers
const { SP500_TICKERS } = require('../../server/config/sp500-tickers');

const DELAY_MS = 100; // 600 calls/min = 100ms delay

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch current key metrics for a stock
 */
async function fetchKeyMetrics(symbol) {
  try {
    await delay(DELAY_MS);
    const url = `${BASE_URL}/key-metrics/${symbol}?apikey=${FMP_API_KEY}&limit=1`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data[0] || null;
  } catch (error) {
    console.error(`Error fetching key metrics for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch current financial ratios
 */
async function fetchFinancialRatios(symbol) {
  try {
    await delay(DELAY_MS);
    const url = `${BASE_URL}/ratios/${symbol}?apikey=${FMP_API_KEY}&limit=1`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data[0] || null;
  } catch (error) {
    console.error(`Error fetching ratios for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch income statement for growth calculation
 */
async function fetchIncomeStatement(symbol) {
  try {
    await delay(DELAY_MS);
    const url = `${BASE_URL}/income-statement/${symbol}?apikey=${FMP_API_KEY}&limit=2`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data || [];
  } catch (error) {
    console.error(`Error fetching income statement for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Calculate growth rate
 */
function calculateGrowth(current, previous) {
  if (!current || !previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Insert Year 0 data into database
 */
function insertYear0Data(db, data) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO historical_fundamentals (
        symbol, years_ago, date, market_cap, price_to_sales, sales_growth,
        pe_ratio, debt_to_equity, operating_margin, roic, fcf_yield,
        fcf_growth, eps_growth, revenue_cagr, peg_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      data.symbol,
      0, // years_ago = 0 (current year)
      data.date,
      data.market_cap,
      data.price_to_sales,
      data.sales_growth,
      data.pe_ratio,
      data.debt_to_equity,
      data.operating_margin,
      data.roic,
      data.fcf_yield,
      data.fcf_growth,
      data.eps_growth,
      data.revenue_cagr,
      data.peg_ratio
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Process single stock
 */
async function processStock(db, symbol, index, total) {
  console.log(`[${index + 1}/${total}] Processing ${symbol}...`);

  try {
    // Fetch data
    const [keyMetrics, ratios, incomeStatements] = await Promise.all([
      fetchKeyMetrics(symbol),
      fetchFinancialRatios(symbol),
      fetchIncomeStatement(symbol)
    ]);

    if (!keyMetrics || !ratios) {
      console.log(`  ⚠️  ${symbol}: Missing data, skipping`);
      return;
    }

    // Calculate sales growth
    let salesGrowth = null;
    if (incomeStatements.length >= 2) {
      const current = incomeStatements[0].revenue;
      const previous = incomeStatements[1].revenue;
      salesGrowth = calculateGrowth(current, previous);
    }

    // Calculate FCF growth
    let fcfGrowth = null;
    if (incomeStatements.length >= 2) {
      const current = incomeStatements[0].freeCashFlow;
      const previous = incomeStatements[1].freeCashFlow;
      fcfGrowth = calculateGrowth(current, previous);
    }

    // Calculate EPS growth
    let epsGrowth = null;
    if (incomeStatements.length >= 2) {
      const current = incomeStatements[0].eps;
      const previous = incomeStatements[1].eps;
      epsGrowth = calculateGrowth(current, previous);
    }

    // Calculate PEG ratio
    let pegRatio = null;
    if (ratios.peRatio && epsGrowth && epsGrowth > 0) {
      pegRatio = ratios.peRatio / epsGrowth;
    }

    // Prepare data
    const data = {
      symbol,
      date: keyMetrics.date,
      market_cap: keyMetrics.marketCap,
      price_to_sales: ratios.priceToSalesRatio,
      sales_growth: salesGrowth,
      pe_ratio: ratios.peRatio,
      debt_to_equity: ratios.debtEquityRatio,
      operating_margin: keyMetrics.operatingIncomePerShare / keyMetrics.revenuePerShare,
      roic: keyMetrics.roic,
      fcf_yield: keyMetrics.freeCashFlowPerShare / keyMetrics.priceToBookRatio,
      fcf_growth: fcfGrowth,
      eps_growth: epsGrowth,
      revenue_cagr: salesGrowth, // 1-year = same as sales growth
      peg_ratio: pegRatio
    };

    // Insert into database
    await insertYear0Data(db, data);
    console.log(`  ✓ ${symbol}: Saved Year 0 data`);

  } catch (error) {
    console.error(`  ✗ ${symbol}: Error -`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('========================================');
  console.log('Populate Year 0 Data from FMP API');
  console.log('========================================\n');

  const db = new sqlite3.Database(DB_PATH);

  let processed = 0;
  let saved = 0;

  for (let i = 0; i < SP500_TICKERS.length; i++) {
    const symbol = SP500_TICKERS[i];

    try {
      await processStock(db, symbol, i, SP500_TICKERS.length);
      processed++;
      saved++;
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error.message);
      processed++;
    }

    // Progress update every 50 stocks
    if ((i + 1) % 50 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${SP500_TICKERS.length} (${saved} saved) ---\n`);
    }
  }

  db.close();

  console.log('\n========================================');
  console.log('COMPLETE!');
  console.log(`Processed: ${processed} stocks`);
  console.log(`Saved: ${saved} Year 0 records`);
  console.log('========================================');
}

// Run
main().catch(console.error);
