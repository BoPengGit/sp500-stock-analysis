const { initializeDatabase, getStocksFromDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');

(async () => {
  console.log('=== Investigating Single-Metric Weight Bug ===\n');

  await initializeDatabase();
  const stocks = await getStocksFromDB();

  console.log(`Total stocks in database: ${stocks.length}\n`);

  // Test the 0-0-0-0-100 configuration (GF Score Only)
  console.log('=== Configuration: 0-0-0-0-100 (GF Score Only) ===');
  evaluationService.setWeights(0, 0, 0, 0, 100);

  // Get the GF Score ranks manually
  const gfScoreRanks = evaluationService.rankByMetric(stocks, 'gfScore', false);

  console.log('\nTop 10 GF Score Ranks (what we SHOULD see):');
  const stocksWithGF = stocks.filter(s => s.gfScore != null);
  const sortedByGF = [...stocksWithGF].sort((a, b) => b.gfScore - a.gfScore);
  sortedByGF.slice(0, 10).forEach((stock, idx) => {
    const rank = gfScoreRanks.get(stock.symbol);
    console.log(`  #${idx + 1}: ${stock.symbol} - GF Score: ${stock.gfScore}/100, GF Rank: ${rank}`);
  });

  // Now run the full evaluation
  const ranked = evaluationService.evaluateStocks(stocks);

  console.log('\n\nTop 10 from evaluateStocks() (what we ACTUALLY see):');
  ranked.slice(0, 10).forEach((stock, idx) => {
    console.log(`  #${idx + 1}: ${stock.symbol} - GF Score: ${stock.gfScore}/100, GF Rank: ${stock.ranks.gfScore}, Weighted Score: ${stock.weightedScore.toFixed(2)}`);
  });

  // Focus on NVDA, META, AMZN
  console.log('\n\n=== Detailed Analysis of Top 3 ===');

  const nvda = ranked.find(s => s.symbol === 'NVDA');
  const meta = ranked.find(s => s.symbol === 'META');
  const amzn = ranked.find(s => s.symbol === 'AMZN');

  console.log('\nNVDA:');
  console.log(`  GF Score: ${nvda.gfScore}/100`);
  console.log(`  GF Rank: ${nvda.ranks.gfScore}`);
  console.log(`  Weighted Score: ${nvda.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${nvda.overallRank}`);
  console.log(`  Expected Weighted Score: ${nvda.ranks.gfScore * 1.0} (GF Rank × 100%)`);
  console.log(`  Match: ${Math.abs(nvda.weightedScore - nvda.ranks.gfScore) < 0.01 ? '✓' : '✗ BUG!'}`);

  console.log('\nMETA:');
  console.log(`  GF Score: ${meta.gfScore}/100`);
  console.log(`  GF Rank: ${meta.ranks.gfScore}`);
  console.log(`  Weighted Score: ${meta.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${meta.overallRank}`);
  console.log(`  Expected Weighted Score: ${meta.ranks.gfScore * 1.0} (GF Rank × 100%)`);
  console.log(`  Match: ${Math.abs(meta.weightedScore - meta.ranks.gfScore) < 0.01 ? '✓' : '✗ BUG!'}`);

  console.log('\nAMZN:');
  console.log(`  GF Score: ${amzn.gfScore}/100`);
  console.log(`  GF Rank: ${amzn.ranks.gfScore}`);
  console.log(`  Weighted Score: ${amzn.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${amzn.overallRank}`);
  console.log(`  Expected Weighted Score: ${amzn.ranks.gfScore * 1.0} (GF Rank × 100%)`);
  console.log(`  Match: ${Math.abs(amzn.weightedScore - amzn.ranks.gfScore) < 0.01 ? '✓' : '✗ BUG!'}`);

  // Check if weights are being applied correctly
  console.log('\n\n=== Weight Configuration Check ===');
  console.log(`Weights being used:`);
  console.log(`  Market Cap: ${evaluationService.weights.marketCap}%`);
  console.log(`  ADTV: ${evaluationService.weights.adtv}%`);
  console.log(`  Price/Sales: ${evaluationService.weights.priceToSales}%`);
  console.log(`  Sales Growth: ${evaluationService.weights.salesGrowth}%`);
  console.log(`  GF Score: ${evaluationService.weights.gfScore}%`);

  // Manual calculation for AMZN
  console.log('\n\n=== Manual Calculation for AMZN ===');
  console.log(`All ranks for AMZN:`);
  console.log(`  MC Rank: ${amzn.ranks.marketCap}`);
  console.log(`  ADTV Rank: ${amzn.ranks.adtv}`);
  console.log(`  P/S Rank: ${amzn.ranks.priceToSales}`);
  console.log(`  SG Rank: ${amzn.ranks.salesGrowth}`);
  console.log(`  GF Rank: ${amzn.ranks.gfScore}`);

  const manualScore =
    (amzn.ranks.marketCap * 0.00) +
    (amzn.ranks.adtv * 0.00) +
    (amzn.ranks.priceToSales * 0.00) +
    (amzn.ranks.salesGrowth * 0.00) +
    (amzn.ranks.gfScore * 1.00);

  console.log(`\nManual calculation:`);
  console.log(`  (${amzn.ranks.marketCap} × 0.00) + (${amzn.ranks.adtv} × 0.00) + (${amzn.ranks.priceToSales} × 0.00) + (${amzn.ranks.salesGrowth} × 0.00) + (${amzn.ranks.gfScore} × 1.00) = ${manualScore.toFixed(2)}`);
  console.log(`  Evaluation Service Score: ${amzn.weightedScore.toFixed(2)}`);
  console.log(`  Match: ${Math.abs(manualScore - amzn.weightedScore) < 0.01 ? '✓' : '✗ BUG!'}`);

  console.log('\n\n=== DIAGNOSIS ===');
  if (Math.abs(amzn.weightedScore - amzn.ranks.gfScore) > 0.01) {
    console.log('❌ BUG CONFIRMED: With 100% GF weight, weighted score should equal GF rank!');
    console.log(`   AMZN GF Rank: ${amzn.ranks.gfScore}`);
    console.log(`   AMZN Weighted Score: ${amzn.weightedScore.toFixed(2)}`);
    console.log(`   These should be identical!`);
  } else {
    console.log('✓ Weighted score calculation is correct.');
    console.log('  The bug must be in the sorting/ranking logic.');
  }

  process.exit(0);
})();
