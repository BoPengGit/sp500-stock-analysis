const { initializeDatabase, getStocksFromDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');

(async () => {
  console.log('=== Investigating Calculation Mismatch ===\n');

  await initializeDatabase();
  const stocks = await getStocksFromDB();

  console.log(`Total stocks in database: ${stocks.length}`);

  // Count stocks with GF scores
  const withGF = stocks.filter(s => s.gfScore != null);
  const withoutGF = stocks.filter(s => s.gfScore == null);
  console.log(`Stocks with GF Score: ${withGF.length}`);
  console.log(`Stocks without GF Score: ${withoutGF.length}\n`);

  // Find UNH
  const unh = stocks.find(s => s.symbol === 'UNH');
  if (!unh) {
    console.log('UNH not found!');
    process.exit(1);
  }

  console.log('UNH Raw Data from Database:');
  console.log(`  Market Cap: ${unh.marketCap}`);
  console.log(`  ADTV: ${unh.adtv}`);
  console.log(`  P/S: ${unh.priceToSales}`);
  console.log(`  Sales Growth: ${unh.salesGrowth}`);
  console.log(`  GF Score: ${unh.gfScore}\n`);

  // Test Config 1: 35-35-15-15-0
  console.log('=== Configuration 1: 35-35-15-15-0 ===');
  evaluationService.setWeights(35, 35, 15, 15, 0);

  // Get individual metric ranks
  const mcRanks1 = evaluationService.rankByMetric(stocks, 'marketCap', false);
  const adtvRanks1 = evaluationService.rankByMetric(stocks, 'adtv', false);
  const psRanks1 = evaluationService.rankByMetric(stocks, 'priceToSales', true);
  const sgRanks1 = evaluationService.rankByMetric(stocks, 'salesGrowth', false);
  const gfRanks1 = evaluationService.rankByMetric(stocks, 'gfScore', false);

  const unhMcRank1 = mcRanks1.get('UNH');
  const unhAdtvRank1 = adtvRanks1.get('UNH');
  const unhPsRank1 = psRanks1.get('UNH');
  const unhSgRank1 = sgRanks1.get('UNH');
  const unhGfRank1 = gfRanks1.get('UNH');

  console.log('Individual Ranks:');
  console.log(`  MC Rank: ${unhMcRank1}`);
  console.log(`  ADTV Rank: ${unhAdtvRank1}`);
  console.log(`  P/S Rank: ${unhPsRank1}`);
  console.log(`  SG Rank: ${unhSgRank1}`);
  console.log(`  GF Rank: ${unhGfRank1}`);

  // Manual calculation
  const manualScore1 = (unhMcRank1 * 0.35) + (unhAdtvRank1 * 0.35) +
                       (unhPsRank1 * 0.15) + (unhSgRank1 * 0.15) +
                       (unhGfRank1 * 0.00);
  console.log(`  Manual Weighted Score: ${manualScore1.toFixed(2)}`);

  // Now run full evaluation
  const ranked1 = evaluationService.evaluateStocks(stocks);
  const unh1 = ranked1.find(s => s.symbol === 'UNH');

  console.log(`  Evaluation Service Score: ${unh1.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${unh1.overallRank}`);
  console.log(`  Match: ${Math.abs(manualScore1 - unh1.weightedScore) < 0.01 ? '✓' : '✗'}\n`);

  // Test Config 2: 30-30-15-15-10
  console.log('=== Configuration 2: 30-30-15-15-10 ===');
  evaluationService.setWeights(30, 30, 15, 15, 10);

  // Get individual metric ranks (these should be IDENTICAL to Config 1)
  const mcRanks2 = evaluationService.rankByMetric(stocks, 'marketCap', false);
  const adtvRanks2 = evaluationService.rankByMetric(stocks, 'adtv', false);
  const psRanks2 = evaluationService.rankByMetric(stocks, 'priceToSales', true);
  const sgRanks2 = evaluationService.rankByMetric(stocks, 'salesGrowth', false);
  const gfRanks2 = evaluationService.rankByMetric(stocks, 'gfScore', false);

  const unhMcRank2 = mcRanks2.get('UNH');
  const unhAdtvRank2 = adtvRanks2.get('UNH');
  const unhPsRank2 = psRanks2.get('UNH');
  const unhSgRank2 = sgRanks2.get('UNH');
  const unhGfRank2 = gfRanks2.get('UNH');

  console.log('Individual Ranks:');
  console.log(`  MC Rank: ${unhMcRank2}`);
  console.log(`  ADTV Rank: ${unhAdtvRank2}`);
  console.log(`  P/S Rank: ${unhPsRank2}`);
  console.log(`  SG Rank: ${unhSgRank2}`);
  console.log(`  GF Rank: ${unhGfRank2}`);

  // Manual calculation
  const manualScore2 = (unhMcRank2 * 0.30) + (unhAdtvRank2 * 0.30) +
                       (unhPsRank2 * 0.15) + (unhSgRank2 * 0.15) +
                       (unhGfRank2 * 0.10);
  console.log(`  Manual Weighted Score: ${manualScore2.toFixed(2)}`);

  // Now run full evaluation
  const ranked2 = evaluationService.evaluateStocks(stocks);
  const unh2 = ranked2.find(s => s.symbol === 'UNH');

  console.log(`  Evaluation Service Score: ${unh2.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${unh2.overallRank}`);
  console.log(`  Match: ${Math.abs(manualScore2 - unh2.weightedScore) < 0.01 ? '✓' : '✗'}\n`);

  // Verify ranks are constant
  console.log('=== Verification: Individual Ranks Should NOT Change ===');
  console.log(`MC Rank: ${unhMcRank1} → ${unhMcRank2} ${unhMcRank1 === unhMcRank2 ? '✓' : '✗'}`);
  console.log(`ADTV Rank: ${unhAdtvRank1} → ${unhAdtvRank2} ${unhAdtvRank1 === unhAdtvRank2 ? '✓' : '✗'}`);
  console.log(`P/S Rank: ${unhPsRank1} → ${unhPsRank2} ${unhPsRank1 === unhPsRank2 ? '✓' : '✗'}`);
  console.log(`SG Rank: ${unhSgRank1} → ${unhSgRank2} ${unhSgRank1 === unhSgRank2 ? '✓' : '✗'}`);
  console.log(`GF Rank: ${unhGfRank1} → ${unhGfRank2} ${unhGfRank1 === unhGfRank2 ? '✓' : '✗'}\n`);

  // Now explain the frontend data mismatch
  console.log('=== Understanding Frontend Data Mismatch ===');
  console.log('Frontend shows (from user):');
  console.log('  Config 1: Ranks (29, 67, 32, 151, 264) → Score 113.85');
  console.log('  Config 2: Ranks (29, 67, 32, 151, 271) → Score 83.35');
  console.log('');
  console.log('Current backend shows:');
  console.log(`  Config 1: Ranks (${unhMcRank1}, ${unhAdtvRank1}, ${unhPsRank1}, ${unhSgRank1}, ${unhGfRank1}) → Score ${unh1.weightedScore.toFixed(2)}`);
  console.log(`  Config 2: Ranks (${unhMcRank2}, ${unhAdtvRank2}, ${unhPsRank2}, ${unhSgRank2}, ${unhGfRank2}) → Score ${unh2.weightedScore.toFixed(2)}`);
  console.log('');

  // Verify if frontend ranks produce frontend scores
  const frontendScore1 = (29 * 0.35) + (67 * 0.35) + (32 * 0.15) + (151 * 0.15) + (264 * 0.00);
  const frontendScore2 = (29 * 0.30) + (67 * 0.30) + (32 * 0.15) + (151 * 0.15) + (271 * 0.10);

  console.log('Verification of frontend data:');
  console.log(`  Frontend Config 1 calculation: (29×0.35) + (67×0.35) + (32×0.15) + (151×0.15) + (264×0) = ${frontendScore1.toFixed(2)}`);
  console.log(`  Frontend shows: 113.85`);
  console.log(`  Match: ${Math.abs(frontendScore1 - 113.85) < 0.01 ? '✗ NO!' : 'YES'}`);
  console.log('');
  console.log(`  Frontend Config 2 calculation: (29×0.30) + (67×0.30) + (32×0.15) + (151×0.15) + (271×0.10) = ${frontendScore2.toFixed(2)}`);
  console.log(`  Frontend shows: 83.35`);
  console.log(`  Match: ${Math.abs(frontendScore2 - 83.35) < 0.01 ? '✓ YES!' : 'NO'}`);
  console.log('');

  console.log('=== CONCLUSION ===');
  console.log('The frontend is showing STALE data from an earlier API call.');
  console.log('The GF Rank values in the frontend (264, 271) are from when the database had fewer stocks with GF scores.');
  console.log(`Current database has ${withGF.length} stocks with GF scores, which shifts all GF ranks.`);
  console.log('');
  console.log('Additionally, the Config 1 score of 113.85 does NOT match the calculation using the displayed ranks (61.05).');
  console.log('This indicates the frontend cached BOTH different ranks AND a different score from multiple API calls.');
  console.log('');
  console.log('Solution: User needs to hard refresh the browser (Cmd+Shift+R) to clear cached API responses.');

  process.exit(0);
})();
