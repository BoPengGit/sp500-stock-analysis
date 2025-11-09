const stockDataService = require('./server/services/stockDataService');
const portfolioReturnsService = require('./server/services/portfolioReturnsService');

(async () => {
  console.log('Fetching BAC historical data for 4.99 years...\n');
  const data = await stockDataService.getHistoricalPrices('BAC', 4.99);

  if (!data || !data.prices) {
    console.log('No data returned!');
    return;
  }

  console.log('Total prices:', data.prices.length);
  console.log('\nMost recent (index 0):');
  console.log('  Date:', data.prices[0].date);
  console.log('  adjClose:', data.prices[0].adjClose);

  console.log('\nOldest (last index):');
  const last = data.prices[data.prices.length - 1];
  console.log('  Date:', last.date);
  console.log('  adjClose:', last.adjClose);

  // Simulate what portfolioReturnsService does
  const today = new Date();
  const fiveYearsAgo = new Date(today);
  const daysIn499Years = Math.floor(4.99 * 365);
  fiveYearsAgo.setDate(fiveYearsAgo.getDate() - daysIn499Years);

  console.log('\nTarget date for 4.99 years ago:', fiveYearsAgo.toISOString().split('T')[0]);

  // Get price on that date using the same logic
  const priceData = portfolioReturnsService.getPriceOnDate(data, fiveYearsAgo);
  console.log('\nPrice found for target date:');
  console.log('  Date:', priceData?.date);
  console.log('  Price:', priceData?.price);

  const current = data.prices[0].adjClose;
  const startPrice = priceData?.price;

  if (startPrice && current) {
    const totalReturn = ((current - startPrice) / startPrice) * 100;
    console.log('\nCalculated Return:');
    console.log('  Start:', startPrice);
    console.log('  End:', current);
    console.log('  Total:', totalReturn.toFixed(2) + '%');
  }

  process.exit(0);
})();
