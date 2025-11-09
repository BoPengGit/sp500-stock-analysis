const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { SP500_TICKERS } = require('./server/config/sp500-tickers');

const FMP_API_KEY = process.env.FMP_API_KEY || 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const db = new sqlite3.Database('./stock_data.db');

function calculateGrowth(currentValue, previousValue) {
  if (!currentValue || !previousValue || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

async function fetchFundamentalsForDate(symbol, date) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}`,
      { params: { apikey: FMP_API_KEY, limit: 10 }, timeout: 10000 }
    );
    if (!response.data || response.data.length === 0) return null;
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
    return null;
  }
}

async function fetchIncomeStatement(symbol) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/income-statement/${symbol}`,
      { params: { apikey: FMP_API_KEY, limit: 10 }, timeout: 10000 }
    );
    return response.data || [];
  } catch (error) {
    return [];
  }
}

async function fetchCashFlow(symbol) {
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}`,
      { params: { apikey: FMP_API_KEY, limit: 10 }, timeout: 10000 }
    );
    return response.data || [];
  } catch (error) {
    return [];
  }
}

async function calculateMetricsForYear(symbol, yearsAgo) {
  try {
    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);
    const dateStr = targetDate.toISOString().split('T')[0];

    const fundamentals = await fetchFundamentalsForDate(symbol, dateStr);
    if (!fundamentals) return null;

    const [incomeStatements, cashFlows] = await Promise.all([
      fetchIncomeStatement(symbol),
      fetchCashFlow(symbol)
    ]);

    const currentData = incomeStatements.find(item =>
      Math.abs(new Date(item.date) - targetDate) < 365 * 24 * 60 * 60 * 1000
    );

    const previousYearDate = new Date(targetDate);
    previousYearDate.setFullYear(previousYearDate.getFullYear() - 1);
    const previousData = incomeStatements.find(item =>
      Math.abs(new Date(item.date) - previousYearDate) < 365 * 24 * 60 * 60 * 1000
    );

    let epsGrowth = null;
    let revenueCagr = null;
    if (currentData && previousData) {
      epsGrowth = calculateGrowth(currentData.eps, previousData.eps);
      revenueCagr = calculateGrowth(currentData.revenue, previousData.revenue);
    }

    let fcfGrowth = null;
    const currentCF = cashFlows.find(item =>
      Math.abs(new Date(item.date) - targetDate) < 365 * 24 * 60 * 60 * 1000
    );
    const previousCF = cashFlows.find(item =>
      Math.abs(new Date(item.date) - previousYearDate) < 365 * 24 * 60 * 60 * 1000
    );
    if (currentCF && previousCF) {
      fcfGrowth = calculateGrowth(currentCF.freeCashFlow, previousCF.freeCashFlow);
    }

    let pegRatio = null;
    if (fundamentals.peRatio && epsGrowth && epsGrowth > 0) {
      pegRatio = fundamentals.peRatio / epsGrowth;
    }

    const operatingMargin = (currentData && currentData.operatingIncome && currentData.revenue && currentData.revenue !== 0)
      ? currentData.operatingIncome / currentData.revenue
      : null;

    return {
      symbol,
      yearsAgo,
      date: fundamentals.date,
      marketCap: fundamentals.marketCap,
      adtv: null,
      priceToSales: fundamentals.priceToSalesRatio,
      salesGrowth: fundamentals.revenuePerShareGrowth,
      gfScore: null,
      peRatio: fundamentals.peRatio,
      debtToEquity: fundamentals.debtToEquity,
      operatingMargin,
      roic: fundamentals.roic,
      fcfYield: fundamentals.freeCashFlowYield,
      fcfGrowth,
      epsGrowth,
      revenueCagr,
      pegRatio,
      rawData: JSON.stringify(fundamentals)
    };
  } catch (error) {
    return null;
  }
}

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
      metrics.symbol, metrics.yearsAgo, metrics.date, metrics.marketCap, metrics.adtv,
      metrics.priceToSales, metrics.salesGrowth, metrics.gfScore, metrics.peRatio,
      metrics.debtToEquity, metrics.operatingMargin, metrics.roic, metrics.fcfYield,
      metrics.fcfGrowth, metrics.epsGrowth, metrics.revenueCagr, metrics.pegRatio,
      metrics.rawData
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  console.log('Recalculating Years 4, 5, 6 with correct growth metrics...\n');

  let saved = 0;
  let processed = 0;

  for (const symbol of SP500_TICKERS) {
    console.log(`[${processed + 1}/${SP500_TICKERS.length}] Processing ${symbol}...`);

    for (let yearsAgo = 4; yearsAgo <= 6; yearsAgo++) {
      try {
        const metrics = await calculateMetricsForYear(symbol, yearsAgo);
        if (metrics) {
          await saveMetrics(metrics);
          saved++;
          console.log(`  ✓ Year ${yearsAgo}: FCF=${metrics.fcfGrowth?.toFixed(2) || 'N/A'}, EPS=${metrics.epsGrowth?.toFixed(2) || 'N/A'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        console.error(`  ✗ Error for Year ${yearsAgo}:`, error.message);
      }
    }
    processed++;
  }

  console.log(`\n✓ Calculation complete! Saved ${saved} records for Years 4-6`);
  console.log('\nShifting Years 4-6 to Years 3-5...');

  // Shift Years 4-6 to Years 3-5
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TEMP TABLE year_shift AS
        SELECT
          symbol, years_ago - 1 AS new_years_ago, date, market_cap, adtv,
          price_to_sales, sales_growth, gf_score, pe_ratio, debt_to_equity,
          operating_margin, roic, fcf_yield, fcf_growth, eps_growth,
          revenue_cagr, peg_ratio, raw_data
        FROM historical_fundamentals
        WHERE years_ago BETWEEN 4 AND 6
      `);

      db.run(`DELETE FROM historical_fundamentals WHERE years_ago BETWEEN 4 AND 6`);

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
        else resolve();
      });
    });
  });

  console.log('✓ Shift complete!\n');

  db.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
