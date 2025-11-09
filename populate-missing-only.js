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

// Determine which endpoints we need to call based on missing fields
function getNeededEndpoints(record) {
  const needed = {
    keyMetrics: false,
    income: false,
    cashFlow: false,
    ratios: false,
    adtv: false
  };

  // Check which data is missing
  if (!record.marketCap || !record.peRatio || !record.pegRatio || !record.debtToEquity ||
      !record.roic || !record.incomeQuality || !record.workingCapital || !record.enterpriseValue) {
    needed.keyMetrics = true;
  }

  if (!record.salesGrowth || !record.epsGrowth || !record.revenueCagr) {
    needed.income = true;
  }

  if (!record.freeCashFlow || !record.fcfYield || !record.fcfGrowth) {
    needed.cashFlow = true;
  }

  if (!record.operatingMargin || !record.roe || !record.grossProfitMargin ||
      !record.cashConversionCycle || !record.inventoryTurnover || !record.receivablesTurnover ||
      !record.currentRatio || !record.cashFlowToDebtRatio) {
    needed.ratios = true;
  }

  if (!record.adtv) {
    needed.adtv = true;
  }

  return needed;
}

async function fetchMissingData(symbol, year, quarter, needed) {
  const data = {};

  try {
    let keyMetricsData, incomeData, cashFlowData, ratiosData;

    // Only fetch needed endpoints
    if (needed.keyMetrics) {
      keyMetricsData = await rateLimitedFetch(
        `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
      );
    }

    if (needed.income) {
      incomeData = await rateLimitedFetch(
        `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
      );
    }

    if (needed.cashFlow) {
      cashFlowData = await rateLimitedFetch(
        `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
      );
    }

    if (needed.ratios) {
      ratiosData = await rateLimitedFetch(
        `https://financialmodelingprep.com/api/v3/ratios/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
      );
    }

    // Extract data from responses (API returns calendarYear as string, so convert)
    const yearStr = String(year);
    const keyMetrics = keyMetricsData?.find(m => m.calendarYear === yearStr && m.period === quarter);
    const income = incomeData?.find(s => s.calendarYear === yearStr && s.period === quarter);
    const cashFlow = cashFlowData?.find(s => s.calendarYear === yearStr && s.period === quarter);
    const ratios = ratiosData?.find(r => r.calendarYear === yearStr && r.period === quarter);

    // Extract metrics
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
    const prevYearStr = String(prevYear);
    const threeYearsAgoStr = String(year - 3);

    if (needed.income && data.revenue) {
      const prevIncome = incomeData?.find(s => s.calendarYear === prevYearStr && s.period === quarter);
      if (prevIncome && prevIncome.revenue && prevIncome.revenue !== 0) {
        data.salesGrowth = ((data.revenue - prevIncome.revenue) / Math.abs(prevIncome.revenue)) * 100;
      }
    }

    if (needed.income && data.eps) {
      const prevIncome = incomeData?.find(s => s.calendarYear === prevYearStr && s.period === quarter);
      if (prevIncome && prevIncome.eps && prevIncome.eps !== 0) {
        data.epsGrowth = ((data.eps - prevIncome.eps) / Math.abs(prevIncome.eps)) * 100;
      }
    }

    if (needed.cashFlow && data.freeCashFlow) {
      const prevCashFlow = cashFlowData?.find(s => s.calendarYear === prevYearStr && s.period === quarter);
      if (prevCashFlow && prevCashFlow.freeCashFlow && prevCashFlow.freeCashFlow !== 0) {
        data.fcfGrowth = ((data.freeCashFlow - prevCashFlow.freeCashFlow) / Math.abs(prevCashFlow.freeCashFlow)) * 100;
      }
    }

    // Revenue CAGR (3-year)
    if (needed.income && data.revenue) {
      const oldIncome = incomeData?.find(s => s.calendarYear === threeYearsAgoStr && s.period === quarter);
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

async function populateMissingData(db) {
  console.log('\n=== POPULATING ONLY MISSING DATA (SMART FETCH) ===\n');

  // Get ALL records with at least one missing field
  const records = await dbAll(db, `
    SELECT *
    FROM historical_fundamentals
    WHERE yearsAgo BETWEEN 0 AND 10
    AND (
      marketCap IS NULL OR
      adtv IS NULL OR
      priceToSales IS NULL OR
      salesGrowth IS NULL OR
      peRatio IS NULL OR
      debtToEquity IS NULL OR
      freeCashFlow IS NULL OR
      operatingMargin IS NULL OR
      roic IS NULL OR
      pegRatio IS NULL OR
      fcfYield IS NULL OR
      fcfGrowth IS NULL OR
      epsGrowth IS NULL OR
      revenueCagr IS NULL OR
      incomeQuality IS NULL OR
      roe IS NULL OR
      grossProfitMargin IS NULL OR
      cashConversionCycle IS NULL OR
      inventoryTurnover IS NULL OR
      receivablesTurnover IS NULL OR
      currentRatio IS NULL OR
      cashFlowToDebtRatio IS NULL OR
      workingCapital IS NULL OR
      enterpriseValue IS NULL
    )
    ORDER BY yearsAgo, symbol
  `);

  console.log(`Found ${records.length} records with missing data\n`);

  let updated = 0;
  let skipped = 0;
  let apiCallsSaved = 0;

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

      // Determine which endpoints we actually need
      const needed = getNeededEndpoints(record);
      const endpointsNeeded = Object.values(needed).filter(v => v).length;
      apiCallsSaved += (5 - endpointsNeeded); // We would have made 5 calls, but only making what's needed

      // Fetch only missing data
      const data = await fetchMissingData(symbol, year, quarter, needed);

      // Calculate ADTV if needed
      let adtv = record.adtv;
      if (needed.adtv) {
        adtv = await calculateADTV(symbol, snapshotDate);
      }

      const hasNewData = Object.keys(data).some(key =>
        data[key] !== null && data[key] !== undefined
      ) || (adtv && !record.adtv);

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
          console.log(`  ✓ Updated ${updated} records so far... (Saved ${apiCallsSaved} API calls)`);
        }
      } else {
        skipped++;
      }

    } catch (error) {
      skipped++;
    }
  }

  console.log(`\nSummary: ${updated} updated, ${skipped} skipped`);
  console.log(`API calls saved by smart fetching: ${apiCallsSaved}`);
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);

  console.log('='.repeat(80));
  console.log('SMART DATA POPULATION - ONLY FETCH WHAT\'S MISSING');
  console.log('='.repeat(80));
  console.log('\nThis script analyzes each record and only fetches the endpoints needed');
  console.log('to fill missing data, saving API calls and time.\n');

  try {
    await populateMissingData(db);

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
