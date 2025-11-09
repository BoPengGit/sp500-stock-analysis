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

async function fetchKeyMetrics(symbol, year, quarter) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data || data.length === 0) return null;

    const targetMetrics = data.find(m =>
      m.calendarYear === year && m.period === quarter
    );

    return targetMetrics || null;
  } catch (error) {
    console.error(`Error fetching key metrics for ${symbol} ${year} ${quarter}: ${error.message}`);
    return null;
  }
}

async function fetchIncomeStatement(symbol, year, quarter) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data || data.length === 0) return null;

    const targetStatement = data.find(s =>
      s.calendarYear === year && s.period === quarter
    );

    return targetStatement || null;
  } catch (error) {
    console.error(`Error fetching income statement for ${symbol} ${year} ${quarter}: ${error.message}`);
    return null;
  }
}

async function fetchCashFlowStatement(symbol, year, quarter) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data || data.length === 0) return null;

    const targetStatement = data.find(s =>
      s.calendarYear === year && s.period === quarter
    );

    return targetStatement || null;
  } catch (error) {
    console.error(`Error fetching cash flow for ${symbol} ${year} ${quarter}: ${error.message}`);
    return null;
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
           marketCap, adtv, priceToSales, salesGrowth,
           fcfGrowth, epsGrowth, revenueCagr
    FROM historical_fundamentals
    WHERE yearsAgo BETWEEN 0 AND 10
    AND (
      marketCap IS NULL OR
      adtv IS NULL OR
      priceToSales IS NULL OR
      salesGrowth IS NULL OR
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
    const { symbol, yearsAgo, date: snapshotDate,
            marketCap, adtv, priceToSales, salesGrowth,
            fcfGrowth, epsGrowth, revenueCagr } = record;

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

      let newMarketCap = marketCap;
      let newAdtv = adtv;
      let newPriceToSales = priceToSales;
      let newSalesGrowth = salesGrowth;
      let newFcfGrowth = fcfGrowth;
      let newEpsGrowth = epsGrowth;
      let newRevenueCagr = revenueCagr;

      // Fetch key metrics if needed
      if (!marketCap || !fcfGrowth || !epsGrowth || !revenueCagr) {
        const keyMetrics = await fetchKeyMetrics(symbol, year, quarter);

        if (!newMarketCap) newMarketCap = keyMetrics?.marketCap || null;
        if (!newRevenueCagr) newRevenueCagr = keyMetrics?.revenuePerShareTTM || null;
      }

      // Fetch income statement if needed
      if (!priceToSales || !salesGrowth || !epsGrowth) {
        const incomeStatement = await fetchIncomeStatement(symbol, year, quarter);
        const revenue = incomeStatement?.revenue || null;
        const eps = incomeStatement?.eps || null;

        if (!newPriceToSales && newMarketCap && revenue && revenue > 0) {
          newPriceToSales = newMarketCap / revenue;
        }

        // Calculate sales growth
        if (!newSalesGrowth && revenue) {
          try {
            const prevYear = year - 1;
            const prevIncomeStatement = await fetchIncomeStatement(symbol, prevYear, quarter);
            const prevRevenue = prevIncomeStatement?.revenue;

            if (prevRevenue && prevRevenue > 0) {
              newSalesGrowth = ((revenue - prevRevenue) / Math.abs(prevRevenue)) * 100;
            }
          } catch (error) {
            // Silently fail
          }
        }

        // Calculate EPS growth
        if (!newEpsGrowth && eps) {
          try {
            const prevYear = year - 1;
            const prevIncomeStatement = await fetchIncomeStatement(symbol, prevYear, quarter);
            const prevEps = prevIncomeStatement?.eps;

            if (prevEps && prevEps !== 0) {
              newEpsGrowth = ((eps - prevEps) / Math.abs(prevEps)) * 100;
            }
          } catch (error) {
            // Silently fail
          }
        }
      }

      // Fetch cash flow if needed
      if (!fcfGrowth) {
        const cashFlow = await fetchCashFlowStatement(symbol, year, quarter);
        const fcf = cashFlow?.freeCashFlow || null;

        if (fcf) {
          try {
            const prevYear = year - 1;
            const prevCashFlow = await fetchCashFlowStatement(symbol, prevYear, quarter);
            const prevFcf = prevCashFlow?.freeCashFlow;

            if (prevFcf && prevFcf !== 0) {
              newFcfGrowth = ((fcf - prevFcf) / Math.abs(prevFcf)) * 100;
            }
          } catch (error) {
            // Silently fail
          }
        }
      }

      // Calculate ADTV if needed
      if (!adtv) {
        newAdtv = await calculateADTV(symbol, snapshotDate);
      }

      // Only update if we got new data
      const hasNewData =
        (newMarketCap && !marketCap) ||
        (newAdtv && !adtv) ||
        (newPriceToSales && !priceToSales) ||
        (newSalesGrowth && !salesGrowth) ||
        (newFcfGrowth && !fcfGrowth) ||
        (newEpsGrowth && !epsGrowth) ||
        (newRevenueCagr && !revenueCagr);

      if (hasNewData) {
        await dbRun(db, `
          UPDATE historical_fundamentals
          SET marketCap = COALESCE(?, marketCap),
              adtv = COALESCE(?, adtv),
              priceToSales = COALESCE(?, priceToSales),
              salesGrowth = COALESCE(?, salesGrowth),
              fcfGrowth = COALESCE(?, fcfGrowth),
              epsGrowth = COALESCE(?, epsGrowth),
              revenueCagr = COALESCE(?, revenueCagr)
          WHERE symbol = ? AND yearsAgo = ?
        `, [newMarketCap, newAdtv, newPriceToSales, newSalesGrowth,
            newFcfGrowth, newEpsGrowth, newRevenueCagr, symbol, yearsAgo]);

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
        COUNT(CASE WHEN fcfGrowth IS NOT NULL THEN 1 END) as FCFg,
        COUNT(CASE WHEN epsGrowth IS NOT NULL THEN 1 END) as EPSg,
        COUNT(CASE WHEN revenueCagr IS NOT NULL THEN 1 END) as RevCAGR
      FROM historical_fundamentals
      WHERE yearsAgo BETWEEN 0 AND 10
      GROUP BY yearsAgo
      ORDER BY yearsAgo
    `);

    console.log('Year | Total | MC   | ADTV | PS   | SG   | GF   | FCFg | EPSg | RevCAGR');
    console.log('-'.repeat(80));

    for (const row of coverage) {
      const pct = (count) => `${Math.round(count / row.Total * 100)}%`.padStart(4);
      console.log(
        `${String(row.Year).padStart(4)} | ${String(row.Total).padStart(5)} | ` +
        `${pct(row.MC)} | ${pct(row.ADTV)} | ${pct(row.PS)} | ${pct(row.SG)} | ` +
        `${pct(row.GF)} | ${pct(row.FCFg)} | ${pct(row.EPSg)} | ${pct(row.RevCAGR)}`
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
