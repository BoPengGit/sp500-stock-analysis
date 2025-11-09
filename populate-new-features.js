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

async function fetchNewFeatures(symbol, year, quarter) {
  const features = {};

  try {
    // Fetch key metrics for quality metrics
    const keyMetricsData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );

    const keyMetrics = keyMetricsData?.find(m => m.calendarYear === year && m.period === quarter);

    if (keyMetrics) {
      features.incomeQuality = keyMetrics.incomeQuality;
      features.workingCapital = keyMetrics.workingCapital;
      features.enterpriseValue = keyMetrics.enterpriseValue;
    }

    // Fetch ratios for efficiency and profitability metrics
    const ratiosData = await rateLimitedFetch(
      `https://financialmodelingprep.com/api/v3/ratios/${symbol}?period=quarter&limit=80&apikey=${FMP_API_KEY}`
    );

    const ratios = ratiosData?.find(r => r.calendarYear === year && r.period === quarter);

    if (ratios) {
      features.roe = ratios.returnOnEquity;
      features.grossProfitMargin = ratios.grossProfitMargin ? ratios.grossProfitMargin * 100 : null;
      features.cashConversionCycle = ratios.cashConversionCycle;
      features.inventoryTurnover = ratios.inventoryTurnover;
      features.receivablesTurnover = ratios.receivablesTurnover;
      features.currentRatio = ratios.currentRatio;
      features.cashFlowToDebtRatio = ratios.cashFlowToDebtRatio;
    }

    return features;
  } catch (error) {
    return features;
  }
}

async function populateNewFeatures(db) {
  console.log('\n=== POPULATING NEW HIGH-IMPACT FEATURES ===\n');

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

      const features = await fetchNewFeatures(symbol, year, quarter);

      const hasNewData = Object.keys(features).some(key =>
        features[key] !== null && features[key] !== undefined
      );

      if (hasNewData) {
        await dbRun(db, `
          UPDATE historical_fundamentals
          SET incomeQuality = COALESCE(?, incomeQuality),
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
          features.incomeQuality, features.roe, features.grossProfitMargin,
          features.cashConversionCycle, features.inventoryTurnover, features.receivablesTurnover,
          features.currentRatio, features.cashFlowToDebtRatio, features.workingCapital,
          features.enterpriseValue, symbol, yearsAgo
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

  console.log('='.repeat(60));
  console.log('POPULATING NEW HIGH-IMPACT FEATURES');
  console.log('='.repeat(60));
  console.log('\nFeatures being added:');
  console.log('  • Income Quality (cashflow/earnings)');
  console.log('  • Return on Equity (ROE)');
  console.log('  • Gross Profit Margin');
  console.log('  • Cash Conversion Cycle');
  console.log('  • Inventory Turnover');
  console.log('  • Receivables Turnover');
  console.log('  • Current Ratio');
  console.log('  • Cash Flow to Debt Ratio');
  console.log('  • Working Capital');
  console.log('  • Enterprise Value');
  console.log('');

  try {
    await populateNewFeatures(db);

    console.log('\n' + '='.repeat(60));
    console.log('FEATURE POPULATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total API calls made: ${apiCallCount}\n`);

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
