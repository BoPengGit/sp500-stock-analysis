// BROWSER CONSOLE SCRIPT
// Run this in your browser's developer console on the page showing the stock table
// It will output a CSV format that can be easily imported

// Select all table rows
const rows = document.querySelectorAll('tbody tr');
const data = [];

rows.forEach(row => {
  const symbol = row.querySelector('.symbol-cell')?.textContent.trim();
  if (!symbol) return;

  const cells = row.querySelectorAll('.number-cell');

  // Extract market cap (first number-cell with $ and B)
  let marketCap = null;
  let adtv = null;
  let priceToSales = null;
  let salesGrowth = null;

  cells.forEach(cell => {
    const text = cell.textContent.trim();

    // Market cap: $X,XXX.XXB
    if (text.includes('$') && text.includes('B') && !marketCap) {
      marketCap = text;
    }
    // ADTV: XXX.XXM
    else if (text.includes('M') && !text.includes('$') && !adtv) {
      adtv = text;
    }
    // Price to Sales: decimal number (after ADTV, before first %)
    else if (!priceToSales && /^[0-9]+\.[0-9]+$/.test(text)) {
      const val = parseFloat(text);
      if (val >= 0.01 && val <= 200) {
        priceToSales = text;
      }
    }
    // Sales Growth: first percentage after P/S
    else if (!salesGrowth && text.includes('%')) {
      // Check if positive or negative
      const isNegative = cell.classList.contains('negative');
      salesGrowth = text.replace('%', '');
      if (isNegative && !salesGrowth.includes('-')) {
        salesGrowth = '-' + salesGrowth;
      }
    }
  });

  if (symbol && marketCap && adtv && priceToSales && salesGrowth) {
    data.push([symbol, marketCap, adtv, priceToSales, salesGrowth].join('\t'));
  }
});

// Output as tab-separated values
console.log('SYMBOL\tMARKET_CAP\tADTV\tPRICE_TO_SALES\tSALES_GROWTH');
console.log(data.join('\n'));

// Also copy to clipboard if possible
const output = 'SYMBOL\tMARKET_CAP\tADTV\tPRICE_TO_SALES\tSALES_GROWTH\n' + data.join('\n');
navigator.clipboard.writeText(output).then(() => {
  console.log('\n✓ Data copied to clipboard! Paste it into a file called "year0-data.tsv"');
}).catch(() => {
  console.log('\n! Could not copy to clipboard. Please copy the output above manually.');
});
