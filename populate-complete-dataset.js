const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');
const FMP_API_KEY = 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const CALLS_PER_MINUTE = 700;
const DELAY_MS = (60 * 1000) / CALLS_PER_MINUTE;

let apiCallCount = 0;
let startTime = Date.now();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url) {
  await delay(DELAY_MS);
  apiCallCount++;

  if (apiCallCount % 100 === 0) {
    const elapsed = Date.now() - startTime;
    const rate = (apiCallCount / elapsed) * 60000;
    console.log(`API calls: ${apiCallCount}, Rate: ${rate.toFixed(1)}/min`);
  }

  try {
    const response = await axios.get(url, { timeout: 3000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function fetchCompleteData(symbol, year, quarter) {
  const data = {};

  try {
    // Fetch all endpoints sequentially
    const keyMetricsData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );
    const incomeData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );
    const cashFlowData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );
    const ratiosData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/ratios/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );

    const keyMetrics = keyMetricsData?.find(m => m.calendarYear === year && m.period === quarter);
    const income = incomeData?.find(s => s.calendarYear === year && s.period === quarter);
    const cashFlow = cashFlowData?.find(s => s.calendarYear === year && s.period === quarter);
    const ratios = ratiosData?.find(r => r.calendarYear === year && r.period === quarter);

    // Extract basic metrics
    if (keyMetrics) {
      data.marketCap = keyMetrics.marketCap;
      data.peRatio = keyMetrics.peRatio;
      data.pegRatio = keyMetrics.pegRatio;
      data.debtToEquity = keyMetrics.debtToEquity;
      data.roic = keyMetrics.roic;
      data.incomeQuality = keyMetrics.incomeQuality;
      data.workingCapital = keyMetrics.workingCapital;
      data.enterpriseValue = keyMetrics.enterpriseValue;
    }

    if (income) {
      data.revenue = income.revenue;
      data.eps = income.eps;
    }

    if (ratios) {
      data.operatingMargin = ratios.operatingProfitMargin ? ratios.operatingProfitMargin * 100 : null;
      data.roe = ratios.returnOnEquity;
      data.grossProfitMargin = ratios.grossProfitMargin ? ratios.grossProfitMargin * 100 : null;
      data.cashConversionCycle = ratios.cashConversionCycle;
      data.inventoryTurnover = ratios.inventoryTurnover;
      data.receivablesTurnover = ratios.receivablesTurnover;
      data.currentRatio = ratios.currentRatio;
      data.cashFlowToDebtRatio = ratios.cashFlowToDebtRatio;
    }

    if (cashFlow) {
      data.freeCashFlow = cashFlow.freeCashFlow;
    }

    // Calculate derived metrics
    if (data.marketCap && data.revenue) {
      data.priceToSales = data.marketCap / data.revenue;
    }

    if (data.freeCashFlow && data.marketCap) {
      data.fcfYield = (data.freeCashFlow / data.marketCap) * 100;
    }

    // Calculate growth rates
    const prevYear = year - 1;

    if (data.revenue) {
      const prevIncome = incomeData?.find(s => s.calendarYear === prevYear && s.period === quarter);
      if (prevIncome && prevIncome.revenue && prevIncome.revenue !== 0) {
        data.salesGrowth = ((data.revenue - prevIncome.revenue) / Math.abs(prevIncome.revenue)) * 100;
      }
    }

    if (data.eps) {
      const prevIncome = incomeData?.find(s => s.calendarYear === prevYear && s.period === quarter);
      if (prevIncome && prevIncome.eps && prevIncome.eps !== 0) {
        data.epsGrowth = ((data.eps - prevIncome.eps) / Math.abs(prevIncome.eps)) * 100;
      }
    }

    if (data.freeCashFlow) {
      const prevCashFlow = cashFlowData?.find(s => s.calendarYear === prevYear && s.period === quarter);
      if (prevCashFlow && prevCashFlow.freeCashFlow && prevCashFlow.freeCashFlow !== 0) {
        data.fcfGrowth = ((data.freeCashFlow - prevCashFlow.freeCashFlow) / Math.abs(prevCashFlow.freeCashFlow)) * 100;
      }
    }

    // Revenue CAGR (3-year)
    if (data.revenue) {
      const threeYearsAgo = year - 3;
      const oldIncome = incomeData?.find(s => s.calendarYear === threeYearsAgo && s.period === quarter);
      if (oldIncome && oldIncome.revenue && oldIncome.revenue > 0) {
        data.revenueCagr = (Math.pow(data.revenue / oldIncome.revenue, 1/3) - 1) * 100;
      }
    }

    return data;
  } catch (error) {
    return data;
  }
}

async function calculateADTV(symbol, targetDate) {
  try {
    const endDate = new Date(targetDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${startDate.toISOString().split('T')[0]}&to=${endDate.toISOString().split('T')[0]}&apikey=${FMP_API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data?.historical || data.historical.length === 0) return null;

    const recentDays = data.historical.slice(0, Math.min(20, data.historical.length));
    const totalDollarVolume = recentDays.reduce((sum, day) =>
      sum + (day.close * day.volume), 0
    );

    return totalDollarVolume / recentDays.length / 1000000;
  } catch (error) {
    return null;
  }
}

async function populateCompleteDataset(db) {
  console.log('\n=== POPULATING COMPLETE DATASET (ALL FEATURES) ===\n');

  const records = await dbAll(db, `
    SELECT symbol, yearsAgo, date
    FROM historical_fundamentals
    WHERE yearsAgo BETWEEN 0 AND 10
    ORDER BY yearsAgo, symbol
  `);

  console.log(`Found ${records.length} records to populate\n`);

  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const { symbol, yearsAgo, date: snapshotDate } = record;

    const currentNum = updated + skipped + 1;
    if (currentNum % 50 === 0 || currentNum === 1) {
      console.log(`Processing ${symbol} Year ${yearsAgo} (${currentNum}/${records.length})...`);
    }

    try {
      const date = new Date(snapshotDate);
      const year = date.getFullYear();

      const month = date.getMonth() + 1;
      let quarter;
      if (month <= 3) quarter = 'Q1';
      else if (month <= 6) quarter = 'Q2';
      else if (month <= 9) quarter = 'Q3';
      else quarter = 'Q4';

      const data = await fetchCompleteData(symbol, year, quarter);

      // Calculate ADTV
      const adtv = await calculateADTV(symbol, snapshotDate);

      const hasNewData = Object.keys(data).some(key =>
        data[key] !== null && data[key] !== undefined
      ) || adtv;

      if (hasNewData) {
        await dbRun(db, `
          UPDATE historical_fundamentals
          SET marketCap = COALESCE(?, marketCap),
              adtv = COALESCE(?, adtv),
              priceToSales = COALESCE(?, priceToSales),
              salesGrowth = COALESCE(?, salesGrowth),
              peRatio = COALESCE(?, peRatio),
              debtToEquity = COALESCE(?, debtToEquity),
              freeCashFlow = COALESCE(?, freeCashFlow),
              operatingMargin = COALESCE(?, operatingMargin),
              roic = COALESCE(?, roic),
              pegRatio = COALESCE(?, pegRatio),
              fcfYield = COALESCE(?, fcfYield),
              fcfGrowth = COALESCE(?, fcfGrowth),
              epsGrowth = COALESCE(?, epsGrowth),
              revenueCagr = COALESCE(?, revenueCagr),
              incomeQuality = COALESCE(?, incomeQuality),
              roe = COALESCE(?, roe),
              grossProfitMargin = COALESCE(?, grossProfitMargin),
              cashConversionCycle = COALESCE(?, cashConversionCycle),
              inventoryTurnover = COALESCE(?, inventoryTurnover),
              receivablesTurnover = COALESCE(?, receivablesTurnover),
              currentRatio = COALESCE(?, currentRatio),
              cashFlowToDebtRatio = COALESCE(?, cashFlowToDebtRatio),
              workingCapital = COALESCE(?, workingCapital),
              enterpriseValue = COALESCE(?, enterpriseValue)
          WHERE symbol = ? AND yearsAgo = ?
        `, [
          data.marketCap, adtv, data.priceToSales, data.salesGrowth,
          data.peRatio, data.debtToEquity, data.freeCashFlow, data.operatingMargin,
          data.roic, data.pegRatio, data.fcfYield, data.fcfGrowth, data.epsGrowth,
          data.revenueCagr, data.incomeQuality, data.roe, data.grossProfitMargin,
          data.cashConversionCycle, data.inventoryTurnover, data.receivablesTurnover,
          data.currentRatio, data.cashFlowToDebtRatio, data.workingCapital,
          data.enterpriseValue, symbol, yearsAgo
        ]);

        updated++;
        if (updated % 50 === 0) {
          console.log(`  ✓ Updated ${updated} records so far...`);
        }
      } else {
        skipped++;
      }

    } catch (error) {
      skipped++;
    }
  }

  console.log(`\nSummary: ${updated} updated, ${skipped} skipped`);
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);

  console.log('='.repeat(80));
  console.log('POPULATING COMPLETE DATASET - ALL FEATURES FOR YEARS 0-10');
  console.log('='.repeat(80));
  console.log('\nFeatures included:');
  console.log('  BASIC: Market Cap, ADTV, P/S, Sales Growth, P/E, D/E, FCF, Op Margin, ROIC');
  console.log('  GROWTH: FCF Growth, EPS Growth, Revenue CAGR, PEG Ratio');
  console.log('  QUALITY: Income Quality, ROE, Gross Margin');
  console.log('  EFFICIENCY: Cash Conversion Cycle, Inventory Turnover, Receivables Turnover');
  console.log('  HEALTH: Current Ratio, Cash Flow/Debt Ratio, Working Capital, Enterprise Value');
  console.log('');

  try {
    await populateCompleteDataset(db);

    console.log('\n' + '='.repeat(80));
    console.log('DATA POPULATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total API calls made: ${apiCallCount}`);
    console.log(`Average rate: ${((apiCallCount / (Date.now() - startTime)) * 60000).toFixed(1)} calls/min\n`);

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
