const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');
const FMP_API_KEY = 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const CALLS_PER_MINUTE = 745;
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
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    }
    throw error;
  }
}

async function fetchAllData(symbol, year, quarter) {
  const data = {};

  try {
    // Fetch key metrics
    const keyMetricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const keyMetricsData = await rateLimitedFetch(keyMetricsUrl);

    const targetMetrics = keyMetricsData?.find(m =>
      m.calendarYear === year && m.period === quarter
    );

    if (targetMetrics) {
      data.marketCap = targetMetrics.marketCap;
      data.peRatio = targetMetrics.peRatio;
      data.pegRatio = targetMetrics.pegRatio;
      data.debtToEquity = targetMetrics.debtToEquity;
      data.roic = targetMetrics.roic;
      data.fcfYield = targetMetrics.fcfPerShare / targetMetrics.priceToSalesRatio; // Approximation
    }

    // Fetch income statement
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const incomeData = await rateLimitedFetch(incomeUrl);

    const targetIncome = incomeData?.find(s =>
      s.calendarYear === year && s.period === quarter
    );

    if (targetIncome) {
      data.revenue = targetIncome.revenue;
      data.eps = targetIncome.eps;
      data.operatingMargin = (targetIncome.operatingIncome / targetIncome.revenue) * 100;

      if (data.marketCap && data.revenue) {
        data.priceToSales = data.marketCap / data.revenue;
      }
    }

    // Fetch cash flow statement
    const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const cashFlowData = await rateLimitedFetch(cashFlowUrl);

    const targetCashFlow = cashFlowData?.find(s =>
      s.calendarYear === year && s.period === quarter
    );

    if (targetCashFlow) {
      data.freeCashFlow = targetCashFlow.freeCashFlow;
    }

    // Calculate growth rates (need previous year data)
    const prevYear = year - 1;

    // Sales Growth
    if (data.revenue) {
      const prevIncome = incomeData?.find(s =>
        s.calendarYear === prevYear && s.period === quarter
      );
      if (prevIncome && prevIncome.revenue && prevIncome.revenue !== 0) {
        data.salesGrowth = ((data.revenue - prevIncome.revenue) / Math.abs(prevIncome.revenue)) * 100;
      }
    }

    // EPS Growth
    if (data.eps) {
      const prevIncome = incomeData?.find(s =>
        s.calendarYear === prevYear && s.period === quarter
      );
      if (prevIncome && prevIncome.eps && prevIncome.eps !== 0) {
        data.epsGrowth = ((data.eps - prevIncome.eps) / Math.abs(prevIncome.eps)) * 100;
      }
    }

    // FCF Growth
    if (data.freeCashFlow) {
      const prevCashFlow = cashFlowData?.find(s =>
        s.calendarYear === prevYear && s.period === quarter
      );
      if (prevCashFlow && prevCashFlow.freeCashFlow && prevCashFlow.freeCashFlow !== 0) {
        data.fcfGrowth = ((data.freeCashFlow - prevCashFlow.freeCashFlow) / Math.abs(prevCashFlow.freeCashFlow)) * 100;
      }
    }

    // Revenue CAGR (5-year if available)
    if (data.revenue) {
      const fiveYearsAgo = year - 5;
      const oldIncome = incomeData?.find(s =>
        s.calendarYear === fiveYearsAgo && s.period === quarter
      );
      if (oldIncome && oldIncome.revenue && oldIncome.revenue > 0) {
        data.revenueCagr = (Math.pow(data.revenue / oldIncome.revenue, 1/5) - 1) * 100;
      }
    }

    return data;
  } catch (error) {
    console.error(`Error fetching data for ${symbol} ${year} ${quarter}: ${error.message}`);
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

    if (!data.historical || data.historical.length === 0) return null;

    const recentDays = data.historical.slice(0, Math.min(20, data.historical.length));
    const totalDollarVolume = recentDays.reduce((sum, day) =>
      sum + (day.close * day.volume), 0
    );

    return totalDollarVolume / recentDays.length / 1000000;
  } catch (error) {
    console.error(`Error calculating ADTV for ${symbol}: ${error.message}`);
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

async function populateAllMissing(db) {
  console.log('\n=== POPULATING ALL MISSING DATA ===\n');

  const records = await dbAll(db, `
    SELECT symbol, yearsAgo, date,
           marketCap, adtv, priceToSales, salesGrowth, gfScore,
           peRatio, debtToEquity, freeCashFlow, operatingMargin,
           roic, pegRatio, fcfYield, fcfGrowth, epsGrowth, revenueCagr
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
      revenueCagr IS NULL
    )
    ORDER BY yearsAgo, symbol
  `);

  console.log(`Found ${records.length} records with missing data\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of records) {
    const { symbol, yearsAgo, date: snapshotDate } = record;

    const currentNum = updated + failed + skipped + 1;
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

      // Fetch all data
      const fetchedData = await fetchAllData(symbol, year, quarter);

      // Calculate ADTV if needed
      let newAdtv = record.adtv;
      if (!newAdtv) {
        newAdtv = await calculateADTV(symbol, snapshotDate);
      }

      // Only update if we got new data
      const hasNewData = Object.keys(fetchedData).some(key =>
        fetchedData[key] !== null && fetchedData[key] !== undefined && !record[key]
      ) || (newAdtv && !record.adtv);

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
              revenueCagr = COALESCE(?, revenueCagr)
          WHERE symbol = ? AND yearsAgo = ?
        `, [
          fetchedData.marketCap, newAdtv, fetchedData.priceToSales, fetchedData.salesGrowth,
          fetchedData.peRatio, fetchedData.debtToEquity, fetchedData.freeCashFlow,
          fetchedData.operatingMargin, fetchedData.roic, fetchedData.pegRatio,
          fetchedData.fcfYield, fetchedData.fcfGrowth, fetchedData.epsGrowth,
          fetchedData.revenueCagr, symbol, yearsAgo
        ]);

        updated++;
        if (updated % 50 === 0) {
          console.log(`  ✓ Updated ${updated} records so far...`);
        }
      } else {
        skipped++;
      }

    } catch (error) {
      failed++;
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }

  console.log(`\nSummary: ${updated} updated, ${skipped} skipped (no data), ${failed} failed`);
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);

  console.log('='.repeat(60));
  console.log('POPULATING ALL MISSING FUNDAMENTAL DATA');
  console.log('='.repeat(60));

  try {
    await populateAllMissing(db);

    console.log('\n' + '='.repeat(60));
    console.log('FINAL DATABASE COVERAGE');
    console.log('='.repeat(60) + '\n');

    const coverage = await dbAll(db, `
      SELECT
        yearsAgo as Year,
        COUNT(*) as Total,
        COUNT(CASE WHEN marketCap IS NOT NULL THEN 1 END) as MC,
        COUNT(CASE WHEN adtv IS NOT NULL THEN 1 END) as ADTV,
        COUNT(CASE WHEN priceToSales IS NOT NULL THEN 1 END) as PS,
        COUNT(CASE WHEN salesGrowth IS NOT NULL THEN 1 END) as SG,
        COUNT(CASE WHEN gfScore IS NOT NULL THEN 1 END) as GF,
        COUNT(CASE WHEN peRatio IS NOT NULL THEN 1 END) as PE,
        COUNT(CASE WHEN debtToEquity IS NOT NULL THEN 1 END) as DE,
        COUNT(CASE WHEN freeCashFlow IS NOT NULL THEN 1 END) as FCF,
        COUNT(CASE WHEN operatingMargin IS NOT NULL THEN 1 END) as OM,
        COUNT(CASE WHEN roic IS NOT NULL THEN 1 END) as ROIC,
        COUNT(CASE WHEN pegRatio IS NOT NULL THEN 1 END) as PEG,
        COUNT(CASE WHEN fcfYield IS NOT NULL THEN 1 END) as FCFy,
        COUNT(CASE WHEN fcfGrowth IS NOT NULL THEN 1 END) as FCFg,
        COUNT(CASE WHEN epsGrowth IS NOT NULL THEN 1 END) as EPSg,
        COUNT(CASE WHEN revenueCagr IS NOT NULL THEN 1 END) as RevCAGR
      FROM historical_fundamentals
      WHERE yearsAgo BETWEEN 0 AND 10
      GROUP BY yearsAgo
      ORDER BY yearsAgo
    `);

    console.log('Year | Total | MC  | ADTV| PS  | SG  | GF  | PE  | D/E | FCF | OM  | ROIC| PEG |FCFy |FCFg |EPSg |RevC');
    console.log('-'.repeat(120));

    for (const row of coverage) {
      const pct = (count) => `${Math.round(count / row.Total * 100)}%`.padStart(4);
      console.log(
        `${String(row.Year).padStart(4)} | ${String(row.Total).padStart(5)} |` +
        `${pct(row.MC)}|${pct(row.ADTV)}|${pct(row.PS)}|${pct(row.SG)}|${pct(row.GF)}|` +
        `${pct(row.PE)}|${pct(row.DE)}|${pct(row.FCF)}|${pct(row.OM)}|${pct(row.ROIC)}|` +
        `${pct(row.PEG)}|${pct(row.FCFy)}|${pct(row.FCFg)}|${pct(row.EPSg)}|${pct(row.RevCAGR)}`
      );
    }

    console.log('\n✓ Data population complete!');
    console.log(`Total API calls made: ${apiCallCount}`);

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
