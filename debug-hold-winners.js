const holdWinnersService = require('./server/services/holdWinnersService');

async function debugHoldWinners() {
  const service = holdWinnersService;

  const params = {
    years: 2,
    portfolioSize: 10,
    keepThreshold: 10,
    weights: {
      marketCap: 5,
      adtv: 30,
      priceToSales: 5,
      salesGrowth: 55,
      gfScore: 5
    }
  };

  console.log('Testing Hold Winners with:', params);
  console.log('');

  try {
    const result = await service.calculateHoldWinnersReturn(
      params.years,
      params.portfolioSize,
      params.keepThreshold,
      params.weights
    );

    console.log('\n=== RESULT ===');
    console.log('Transactions:', result.transactions.length);
    result.transactions.forEach((txn, idx) => {
      console.log(`\n${idx + 1}. ${txn.date} - ${txn.action}`);
      console.log(`   Stocks (${txn.count}): ${txn.symbols.slice(0, 5).join(', ')}${txn.count > 5 ? '...' : ''}`);
      console.log(`   Portfolio Value: $${txn.portfolioValue?.toFixed(4)}`);
    });

    console.log('\n2 Year Return:', result['2year']?.toFixed(2) + '%');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

debugHoldWinners();
