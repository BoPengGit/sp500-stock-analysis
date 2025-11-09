#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function testTicker(ticker, displayName) {
  const variations = [
    ticker,
    encodeURIComponent(ticker),
    ticker.replace('.', '-'),
    ticker.replace('.', ''),
  ];

  console.log(`\nTesting ${displayName} (${ticker}):`);

  for (const variation of variations) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/quote/${variation}?apikey=${process.env.FMP_API_KEY}`;
      const response = await axios.get(url, { timeout: 5000 });
      if (response.data && response.data.length > 0) {
        const d = response.data[0];
        if (d.symbol && d.name && (d.name.includes('Berkshire') || d.name.includes('Brown'))) {
          console.log(`  ✓ SUCCESS with format '${variation}'`);
          console.log(`    Symbol: ${d.symbol}, Name: ${d.name}`);
          console.log(`    Price: $${d.price}, Market Cap: $${(d.marketCap/1e9).toFixed(1)}B`);
          return variation;
        }
      }
    } catch (e) {
      // Silent fail for each variation
    }
    console.log(`  ✗ '${variation}' failed`);
  }

  console.log(`  ✗ All variations failed for ${displayName}`);
  return null;
}

(async () => {
  console.log('=== Testing BRK.B and BF.B Ticker Formats ===');

  const brk = await testTicker('BRK.B', 'Berkshire Hathaway Class B');
  const bf = await testTicker('BF.B', 'Brown-Forman Class B');

  console.log(`\n=== SUMMARY ===`);
  if (!brk && !bf) {
    console.log('✗ Unable to fetch either BRK.B or BF.B');
    console.log('\nConclusion: FMP API cannot handle ticker symbols with dots.');
    console.log('Impact: 2 stocks missing (0.4% of S&P 500)');
  } else {
    console.log('✓ Found working formats:');
    if (brk) console.log(`  BRK.B: Use "${brk}"`);
    if (bf) console.log(`  BF.B: Use "${bf}"`);
  }

  process.exit(0);
})();
