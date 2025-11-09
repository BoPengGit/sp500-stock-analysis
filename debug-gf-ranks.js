const { initializeDatabase, getStocksFromDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');

(async () => {
  console.log('=== Investigating GF Rank Changes ===\n');

  await initializeDatabase();
  const stocks = await getStocksFromDB();

  // Count stocks with/without GF scores
  const withGF = stocks.filter(s => s.gfScore != null);
  const withoutGF = stocks.filter(s => s.gfScore == null);

  console.log('Stock Distribution:');
  console.log(`  Total: ${stocks.length}`);
  console.log(`  With GF Score: ${withGF.length}`);
  console.log(`  Without GF Score: ${withoutGF.length}\n`);

  // Test both configurations
  console.log('=== Configuration 1: 35-35-15-15-0 ===');
  evaluationService.setWeights(35, 35, 15, 15, 0);
  const ranked1 = evaluationService.evaluateStocks(stocks);

  const unh1 = ranked1.find(s => s.symbol === 'UNH');
  console.log(`UNH: GF Score=${unh1.gfScore}, GF Rank=${unh1.ranks.gfScore}, Overall Rank=${unh1.overallRank}`);

  // Check what ranks stocks without GF get
  const noGF1 = ranked1.filter(s => s.gfScore == null);
  if (noGF1.length > 0) {
    const gfRanks = noGF1.map(s => s.ranks.gfScore);
    const uniqueRanks = [...new Set(gfRanks)].sort((a,b) => a-b);
    console.log(`Stocks without GF scores get rank(s): ${uniqueRanks.join(', ')}`);
  }

  console.log('\n=== Configuration 2: 30-30-15-15-10 ===');
  evaluationService.setWeights(30, 30, 15, 15, 10);
  const ranked2 = evaluationService.evaluateStocks(stocks);

  const unh2 = ranked2.find(s => s.symbol === 'UNH');
  console.log(`UNH: GF Score=${unh2.gfScore}, GF Rank=${unh2.ranks.gfScore}, Overall Rank=${unh2.overallRank}`);

  // Check what ranks stocks without GF get
  const noGF2 = ranked2.filter(s => s.gfScore == null);
  if (noGF2.length > 0) {
    const gfRanks = noGF2.map(s => s.ranks.gfScore);
    const uniqueRanks = [...new Set(gfRanks)].sort((a,b) => a-b);
    console.log(`Stocks without GF scores get rank(s): ${uniqueRanks.join(', ')}`);
  }

  console.log('\n=== Issue Analysis ===');
  if (unh1.ranks.gfScore !== unh2.ranks.gfScore) {
    console.log(`❌ BUG: UNH's GF Rank changed from ${unh1.ranks.gfScore} to ${unh2.ranks.gfScore}`);
    console.log(`   GF Rank should NEVER change - it's based on the raw GF Score which is constant!`);
    console.log(`\n   Root cause: The ranking logic is being re-run for each configuration,`);
    console.log(`   and stocks without GF scores are being included differently each time.`);
  } else {
    console.log(`✓ GF Rank remained constant: ${unh1.ranks.gfScore}`);
  }

  process.exit(0);
})();
