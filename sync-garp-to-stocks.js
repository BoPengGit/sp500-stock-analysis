const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

/**
 * Sync GARP metrics from historical_fundamentals (yearsAgo=0) to stocks table
 */
async function syncGARPMetrics() {
  const db = new sqlite3.Database(DB_PATH);

  return new Promise((resolve, reject) => {
    console.log('Syncing GARP metrics from historical_fundamentals to stocks table...\n');

    // Update stocks table with GARP metrics from most recent historical data (yearsAgo=0)
    const sql = `
      UPDATE stocks
      SET
        peRatio = (SELECT peRatio FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        debtToEquity = (SELECT debtToEquity FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        freeCashFlow = (SELECT freeCashFlow FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        operatingMargin = (SELECT operatingMargin FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        roic = (SELECT roic FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        pegRatio = (SELECT pegRatio FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0),
        fcfYield = (SELECT fcfYield FROM historical_fundamentals WHERE symbol = stocks.symbol AND yearsAgo = 0)
      WHERE EXISTS (
        SELECT 1 FROM historical_fundamentals
        WHERE symbol = stocks.symbol AND yearsAgo = 0
      );
    `;

    db.run(sql, function(err) {
      if (err) {
        console.error('Error syncing GARP metrics:', err);
        reject(err);
        return;
      }

      console.log(`✅ Updated ${this.changes} stocks with GARP metrics\n`);

      // Get statistics
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(peRatio) as with_pe,
          COUNT(debtToEquity) as with_de,
          COUNT(roic) as with_roic,
          COUNT(operatingMargin) as with_om,
          COUNT(fcfYield) as with_fcf,
          COUNT(pegRatio) as with_peg
        FROM stocks
      `, (err, stats) => {
        if (err) {
          console.error('Error getting stats:', err);
          reject(err);
          return;
        }

        console.log('Current GARP Metrics Coverage in stocks table:');
        console.log(`  Total stocks: ${stats.total}`);
        console.log(`  With P/E Ratio: ${stats.with_pe} (${((stats.with_pe / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  With Debt/Equity: ${stats.with_de} (${((stats.with_de / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  With ROIC: ${stats.with_roic} (${((stats.with_roic / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  With Operating Margin: ${stats.with_om} (${((stats.with_om / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  With FCF Yield: ${stats.with_fcf} (${((stats.with_fcf / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  With PEG Ratio: ${stats.with_peg} (${((stats.with_peg / stats.total) * 100).toFixed(1)}%)`);

        db.close();
        resolve(stats);
      });
    });
  });
}

syncGARPMetrics()
  .then(() => {
    console.log('\n✅ GARP metrics sync completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error syncing GARP metrics:', err);
    process.exit(1);
  });
