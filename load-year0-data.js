const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');
const DATA_FILE = path.join(__dirname, 'year0-data-simple.txt');

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('POPULATING YEAR 0 FROM FRONTEND DATA');
  console.log('='.repeat(60));
  console.log('');

  const db = new sqlite3.Database(DB_PATH);

  try {
    // Read the data file
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const lines = data.trim().split('\n');

    console.log(`Loaded ${lines.length} records from data file\n`);

    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length !== 5) continue;

      const symbol = parts[0].trim();
      const marketCap = parseFloat(parts[1]) * 1_000_000_000; // Billions to actual
      const adtv = parseFloat(parts[2]) * 1_000_000; // Millions to actual
      const priceToSales = parseFloat(parts[3]);
      const salesGrowth = parseFloat(parts[4]);

      try {
        const result = await dbRun(db, `
          UPDATE historical_fundamentals
          SET marketCap = ?,
              adtv = ?,
              priceToSales = ?,
              salesGrowth = ?
          WHERE symbol = ? AND yearsAgo = 0
        `, [marketCap, adtv, priceToSales, salesGrowth, symbol]);

        if (result.changes > 0) {
          updated++;
          if (updated % 50 === 0) {
            console.log(`Progress: ${updated}/${lines.length} updated`);
          }
        } else {
          notFound++;
          console.log(`  ⚠ ${symbol}: No Year 0 record in database`);
        }
      } catch (error) {
        failed++;
        console.error(`  ✗ ${symbol}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('YEAR 0 POPULATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`✓ Updated: ${updated}`);
    console.log(`⚠ Not found in DB: ${notFound}`);
    console.log(`✗ Failed: ${failed}`);
    console.log(`Total processed: ${lines.length}`);

    // Verify a few samples
    console.log('\nVerifying sample records...');
    const verifyQuery = `
      SELECT symbol, marketCap, adtv, priceToSales, salesGrowth
      FROM historical_fundamentals
      WHERE yearsAgo = 0 AND symbol IN ('NVDA', 'AAPL', 'MSFT', 'GOOG', 'AMZN')
      ORDER BY symbol
    `;

    db.all(verifyQuery, [], (err, rows) => {
      if (err) {
        console.error('Verification error:', err);
      } else {
        rows.forEach(row => {
          console.log(`  ${row.symbol}: MC=$${(row.marketCap / 1e9).toFixed(2)}B, ADTV=$${(row.adtv / 1e6).toFixed(2)}M, P/S=${row.priceToSales?.toFixed(2)}, SG=${row.salesGrowth?.toFixed(2)}%`);
        });
      }
      db.close();
    });

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    db.close();
    process.exit(1);
  }
}

main();
