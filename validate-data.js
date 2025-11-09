const axios = require('axios');

const FMP_API_KEY = 'T3za7w6gBj55Xuw5KGE2TojA5eG0MSnI';
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

async function validateStockData() {
  console.log('='.repeat(80));
  console.log('STOCK DATA VALIDATION REPORT');
  console.log('='.repeat(80));
  console.log('\nValidating against Financial Modeling Prep API...\n');

  // Test stocks to validate
  const testStocks = ['NVDA', 'AMZN', 'META', 'MSFT', 'INTC', 'AAPL'];

  for (const symbol of testStocks) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`VALIDATING: ${symbol}`);
    console.log(`${'─'.repeat(80)}`);

    try {
      // 1. Get current quote data
      console.log('\n1. CURRENT QUOTE DATA:');
      const quoteUrl = `${BASE_URL}/quote/${symbol}?apikey=${FMP_API_KEY}`;
      const quoteResponse = await axios.get(quoteUrl);
      const quote = quoteResponse.data[0];

      if (quote) {
        console.log(`   Name: ${quote.name}`);
        console.log(`   Price: $${quote.price}`);
        console.log(`   Market Cap: $${(quote.marketCap / 1e9).toFixed(2)}B`);
        console.log(`   Volume: ${(quote.volume / 1e6).toFixed(2)}M`);
        console.log(`   Average Volume: ${(quote.avgVolume / 1e6).toFixed(2)}M`);
        console.log(`   PE Ratio: ${quote.pe?.toFixed(2) || 'N/A'}`);
      }

      // 2. Get income statement for sales growth
      console.log('\n2. FINANCIAL STATEMENTS (Last 2 Years):');
      const incomeUrl = `${BASE_URL}/income-statement/${symbol}?limit=2&apikey=${FMP_API_KEY}`;
      const incomeResponse = await axios.get(incomeUrl);
      const incomeStatements = incomeResponse.data;

      if (incomeStatements && incomeStatements.length >= 2) {
        const latest = incomeStatements[0];
        const previous = incomeStatements[1];

        const latestRevenue = latest.revenue;
        const previousRevenue = previous.revenue;
        const salesGrowth = ((latestRevenue - previousRevenue) / previousRevenue) * 100;

        console.log(`   Latest Revenue (${latest.date}): $${(latestRevenue / 1e9).toFixed(2)}B`);
        console.log(`   Previous Revenue (${previous.date}): $${(previousRevenue / 1e9).toFixed(2)}B`);
        console.log(`   Sales Growth: ${salesGrowth.toFixed(2)}%`);
        console.log(`   Formula: ((${(latestRevenue/1e9).toFixed(2)}B - ${(previousRevenue/1e9).toFixed(2)}B) / ${(previousRevenue/1e9).toFixed(2)}B) × 100`);
      }

      // 3. Get key metrics for P/S ratio
      console.log('\n3. KEY METRICS:');
      const metricsUrl = `${BASE_URL}/key-metrics/${symbol}?limit=1&apikey=${FMP_API_KEY}`;
      const metricsResponse = await axios.get(metricsUrl);
      const metrics = metricsResponse.data[0];

      if (metrics) {
        console.log(`   Price to Sales: ${metrics.priceToSalesRatio?.toFixed(2) || 'N/A'}`);
        console.log(`   Market Cap / Revenue: ${quote && incomeStatements[0] ? (quote.marketCap / incomeStatements[0].revenue).toFixed(2) : 'N/A'}`);
      }

      // 4. Get historical prices for specific dates
      console.log('\n4. HISTORICAL PRICES (Last 5 Years):');

      // Year 5: Nov 2020 to Nov 2021
      const year5Start = '2020-11-01';
      const year5End = '2021-11-30';
      console.log(`\n   Year 5 (Nov 2020 - Nov 2021):`);
      await validateHistoricalReturn(symbol, year5Start, year5End);

      // Year 4: Nov 2021 to Nov 2022
      const year4Start = '2021-11-01';
      const year4End = '2022-11-30';
      console.log(`\n   Year 4 (Nov 2021 - Nov 2022):`);
      await validateHistoricalReturn(symbol, year4Start, year4End);

      // Year 3: Nov 2022 to Nov 2023
      const year3Start = '2022-11-01';
      const year3End = '2023-11-30';
      console.log(`\n   Year 3 (Nov 2022 - Nov 2023):`);
      await validateHistoricalReturn(symbol, year3Start, year3End);

      // Year 2: Nov 2023 to Nov 2024
      const year2Start = '2023-11-01';
      const year2End = '2024-11-30';
      console.log(`\n   Year 2 (Nov 2023 - Nov 2024):`);
      await validateHistoricalReturn(symbol, year2Start, year2End);

      // Year 1: Nov 2024 to Now
      const year1Start = '2024-11-01';
      const year1End = new Date().toISOString().split('T')[0];
      console.log(`\n   Year 1 (Nov 2024 - Now):`);
      await validateHistoricalReturn(symbol, year1Start, year1End);

    } catch (error) {
      console.error(`   ❌ ERROR: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION COMPLETE');
  console.log('='.repeat(80));
}

async function validateHistoricalReturn(symbol, startDate, endDate) {
  try {
    const histUrl = `${BASE_URL}/historical-price-full/${symbol}?from=${startDate}&to=${endDate}&apikey=${FMP_API_KEY}`;
    const histResponse = await axios.get(histUrl);
    const historical = histResponse.data.historical;

    if (historical && historical.length > 0) {
      // Get first and last prices in the range
      const startPrice = historical[historical.length - 1]; // Oldest
      const endPrice = historical[0]; // Most recent

      const returnPercent = ((endPrice.adjClose - startPrice.adjClose) / startPrice.adjClose) * 100;

      console.log(`     Start Date: ${startPrice.date}`);
      console.log(`     Start Price: $${startPrice.adjClose.toFixed(2)} (adj close)`);
      console.log(`     End Date: ${endPrice.date}`);
      console.log(`     End Price: $${endPrice.adjClose.toFixed(2)} (adj close)`);
      console.log(`     Return: ${returnPercent.toFixed(2)}%`);
      console.log(`     Formula: (($${endPrice.adjClose.toFixed(2)} - $${startPrice.adjClose.toFixed(2)}) / $${startPrice.adjClose.toFixed(2)}) × 100`);

      if (returnPercent >= 0) {
        console.log(`     ✅ GAIN: +${returnPercent.toFixed(2)}%`);
      } else {
        console.log(`     ❌ LOSS: ${returnPercent.toFixed(2)}%`);
      }
    } else {
      console.log('     ⚠️  No historical data available for this period');
    }
  } catch (error) {
    console.log(`     ❌ ERROR: ${error.message}`);
  }
}

// Run validation
validateStockData().catch(console.error);
