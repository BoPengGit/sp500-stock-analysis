const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

// Read the HTML file that contains the frontend data
// The HTML should be saved as 'frontend-table.html' in the same directory
const htmlFile = path.join(__dirname, 'frontend-table.html');

function parseHtmlTable(html) {
  const stocks = [];

  // Match each table row
  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/g;
  const rows = html.match(rowPattern) || [];

  for (const row of rows) {
    // Skip header rows
    if (row.includes('<th')) continue;

    // Extract symbol
    const symbolMatch = row.match(/<td class="symbol-cell">([A-Z]+)<\/td>/);
    if (!symbolMatch) continue;
    const symbol = symbolMatch[1];

    // Extract market cap - looking for pattern like "$4,580.89B"
    const mcMatch = row.match(/\$([0-9,]+\.[0-9]+)B/);
    if (!mcMatch) continue;
    const marketCap = parseFloat(mcMatch[1].replace(/,/g, '')) * 1_000_000_000;

    // Extract ADTV - looking for pattern like "262.85M"
    const adtvMatches = row.match(/([0-9,]+\.[0-9]+)M/g);
    if (!adtvMatches || adtvMatches.length < 1) continue;
    const adtv = parseFloat(adtvMatches[0].replace(/,/g, '').replace('M', '')) * 1_000_000;

    // Extract price to sales - it's a decimal number after ADTV
    // Looking at the HTML structure, P/S comes after the ADTV rank
    const numberCells = row.match(/<td class="number-cell">([^<]+)<\/td>/g) || [];
    let priceToSales = null;
    let salesGrowth = null;

    // Parse all number cells to find P/S and Sales Growth
    // From the pattern: MarketCap, Rank, ADTV, Rank, P/S, Rank, SalesGrowth%, Rank...
    for (let i = 0; i < numberCells.length; i++) {
      const content = numberCells[i].match(/>([^<]+)</)[1];

      // Price to Sales is typically between 0.1 and 100
      if (priceToSales === null && /^[0-9]+\.[0-9]+$/.test(content)) {
        const val = parseFloat(content);
        if (val >= 0.01 && val <= 200) {
          priceToSales = val;
          continue;
        }
      }

      // Sales Growth has a % sign
      if (content.includes('%') && salesGrowth === null) {
        // Check if it's in a cell with "positive" or "negative" class
        const isPositive = numberCells[i].includes('positive');
        const isNegative = numberCells[i].includes('negative');
        let val = parseFloat(content.replace('%', '').replace(',', ''));
        if (isNegative) val = -Math.abs(val);
        salesGrowth = val;
        break; // We've found both, can stop
      }
    }

    if (marketCap && adtv && priceToSales !== null && salesGrowth !== null) {
      stocks.push({ symbol, marketCap, adtv, priceToSales, salesGrowth });
    }
  }

  return stocks;
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function main() {
  try {
    console.log('Reading HTML file...');
    const html = fs.readFileSync(htmlFile, 'utf8');

    console.log('Parsing HTML table...');
    const stocks = parseHtmlTable(html);

    console.log(`Found ${stocks.length} stocks in the HTML table\n`);

    if (stocks.length === 0) {
      console.error('No stocks found! Check the HTML format.');
      process.exit(1);
    }

    // Show first few as examples
    console.log('Sample data:');
    stocks.slice(0, 3).forEach(s => {
      console.log(`  ${s.symbol}: MC=$${(s.marketCap / 1e9).toFixed(2)}B, ADTV=$${(s.adtv / 1e6).toFixed(2)}M, P/S=${s.priceToSales}, SG=${s.salesGrowth}%`);
    });
    console.log('');

    const db = new sqlite3.Database(DB_PATH);

    console.log('Updating database...');
    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const stock of stocks) {
      const { symbol, marketCap, adtv, priceToSales, salesGrowth } = stock;

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
            console.log(`  Progress: ${updated}/${stocks.length}`);
          }
        } else {
          notFound++;
        }
      } catch (error) {
        failed++;
        console.error(`  Error updating ${symbol}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('YEAR 0 POPULATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`✓ Updated: ${updated}`);
    console.log(`⚠ Not found in DB: ${notFound}`);
    console.log(`✗ Failed: ${failed}`);

    db.close();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
