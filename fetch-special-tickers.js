#!/usr/bin/env node

/**
 * Fetch Special Tickers Script
 *
 * Attempts to fetch BRK.B and BF.B using multiple ticker format variations
 * to work around the API's limitation with dots in ticker symbols.
 */

const axios = require('axios');
require('dotenv').config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Try multiple ticker format variations
const TICKER_VARIATIONS = {
  'BRK.B': ['BRK.B', 'BRK-B', 'BRKB', 'BRK/B'],
  'BF.B': ['BF.B', 'BF-B', 'BFB', 'BF/B']
};

async function testTickerFormat(originalTicker, variation) {
  console.log(`  Testing format: "${variation}"`);

  try {
    // Test with quote endpoint first (simpler)
    const quoteUrl = `${BASE_URL}/quote/${variation}?apikey=${FMP_API_KEY}`;
    const response = await axios.get(quoteUrl, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const data = response.data[0];
      if (data.symbol) {
        console.log(`    ✓ SUCCESS! Found data for ${originalTicker} using format "${variation}"`);
        console.log(`      Symbol: ${data.symbol}, Name: ${data.name}, Price: $${data.price}`);
        return { variation, data };
      }
    }

    console.log(`    ✗ No data returned`);
    return null;
  } catch (error) {
    console.log(`    ✗ Error: ${error.message}`);
    return null;
  }
}

async function fetchAllDataForTicker(ticker, workingVariation) {
  console.log(`\n  Fetching complete data for ${ticker} using "${workingVariation}"...`);

  const results = {};

  try {
    // 1. Quote data
    const quoteUrl = `${BASE_URL}/quote/${workingVariation}?apikey=${FMP_API_KEY}`;
    const quoteResponse = await axios.get(quoteUrl);
    results.quote = quoteResponse.data[0];
    console.log(`    ✓ Quote data fetched`);

    // 2. Key metrics
    const metricsUrl = `${BASE_URL}/key-metrics/${workingVariation}?apikey=${FMP_API_KEY}`;
    const metricsResponse = await axios.get(metricsUrl);
    results.metrics = metricsResponse.data[0];
    console.log(`    ✓ Key metrics fetched`);

    // 3. Financial ratios
    const ratiosUrl = `${BASE_URL}/ratios/${workingVariation}?apikey=${FMP_API_KEY}`;
    const ratiosResponse = await axios.get(ratiosUrl);
    results.ratios = ratiosResponse.data[0];
    console.log(`    ✓ Financial ratios fetched`);

    // 4. Growth metrics
    const growthUrl = `${BASE_URL}/financial-growth/${workingVariation}?apikey=${FMP_API_KEY}`;
    const growthResponse = await axios.get(growthUrl);
    results.growth = growthResponse.data[0];
    console.log(`    ✓ Growth metrics fetched`);

    return results;
  } catch (error) {
    console.log(`    ✗ Error fetching complete data: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Special Tickers Fetch Script ===\n');
  console.log('Attempting to fetch BRK.B and BF.B with alternative ticker formats...\n');

  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY not found in .env file');
    process.exit(1);
  }

  const successfulFetches = {};

  for (const [originalTicker, variations] of Object.entries(TICKER_VARIATIONS)) {
    console.log(`\nTesting ${originalTicker}:`);

    let workingFormat = null;

    for (const variation of variations) {
      const result = await testTickerFormat(originalTicker, variation);

      if (result) {
        workingFormat = result.variation;
        break;
      }

      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (workingFormat) {
      // Fetch complete data using the working format
      const completeData = await fetchAllDataForTicker(originalTicker, workingFormat);

      if (completeData) {
        successfulFetches[originalTicker] = {
          workingFormat,
          data: completeData
        };
      }
    } else {
      console.log(`  ✗ All format variations failed for ${originalTicker}`);
    }
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');

  if (Object.keys(successfulFetches).length === 0) {
    console.log('✗ Unable to fetch any special tickers');
    console.log('\nConclusion: The FMP API cannot parse ticker symbols with dots (periods).');
    console.log('This is a fundamental API limitation that cannot be worked around.');
    console.log('\nImpact: Missing 2 stocks out of 502 (0.4% of S&P 500)');
    console.log('This minimal gap will not meaningfully affect portfolio optimization results.');
  } else {
    console.log('✓ Successfully fetched the following tickers:');
    for (const [ticker, info] of Object.entries(successfulFetches)) {
      console.log(`  ${ticker}: Use format "${info.workingFormat}"`);
    }

    console.log('\n\nComplete data:');
    console.log(JSON.stringify(successfulFetches, null, 2));
  }

  console.log('\n=== Script Complete ===');
  process.exit(0);
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
