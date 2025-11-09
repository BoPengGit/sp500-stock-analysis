const { initializeDatabase, getStocksFromDB } = require('./server/database/db');
const evaluationService = require('./server/services/evaluationService');

(async () => {
  console.log('=== Debugging UNH Ranking Behavior ===\n');

  await initializeDatabase();
  const stocks = await getStocksFromDB();

  console.log(`Total stocks in database: ${stocks.length}\n`);

  // Find UNH
  const unh = stocks.find(s => s.symbol === 'UNH');
  if (!unh) {
    console.log('UNH not found in database!');
    process.exit(1);
  }

  console.log('UNH Raw Data:');
  console.log(`  Market Cap: $${(unh.marketCap / 1e9).toFixed(2)}B`);
  console.log(`  ADTV: ${unh.adtv.toLocaleString()}`);
  console.log(`  P/S Ratio: ${unh.priceToSales?.toFixed(2) || 'N/A'}`);
  console.log(`  Sales Growth: ${unh.salesGrowth?.toFixed(2) || 'N/A'}%`);
  console.log(`  GF Score: ${unh.gfScore || 'N/A'}/100\n`);

  // Test with 35-35-15-15-0 (no GF weight)
  console.log('=== Configuration 1: 35-35-15-15-0 (No GF) ===');
  evaluationService.setWeights(35, 35, 15, 15, 0);
  const ranked1 = evaluationService.evaluateStocks(stocks);
  const unh1 = ranked1.find(s => s.symbol === 'UNH');

  console.log('UNH Rankings:');
  console.log(`  MC Rank: ${unh1.ranks.marketCap}`);
  console.log(`  ADTV Rank: ${unh1.ranks.adtv}`);
  console.log(`  P/S Rank: ${unh1.ranks.priceToSales}`);
  console.log(`  Growth Rank: ${unh1.ranks.salesGrowth}`);
  console.log(`  GF Rank: ${unh1.ranks.gfScore}`);
  console.log(`  Weighted Score: ${unh1.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${unh1.overallRank}\n`);

  // Calculate manual weighted score
  const manual1 = (unh1.ranks.marketCap * 0.35) +
                   (unh1.ranks.adtv * 0.35) +
                   (unh1.ranks.priceToSales * 0.15) +
                   (unh1.ranks.salesGrowth * 0.15) +
                   (unh1.ranks.gfScore * 0);
  console.log(`  Manual calculation: ${manual1.toFixed(2)}`);
  console.log(`  Match: ${Math.abs(manual1 - unh1.weightedScore) < 0.01 ? '✓' : '✗'}\n`);

  // Test with 30-30-15-15-10 (10% GF weight)
  console.log('=== Configuration 2: 30-30-15-15-10 (10% GF) ===');
  evaluationService.setWeights(30, 30, 15, 15, 10);
  const ranked2 = evaluationService.evaluateStocks(stocks);
  const unh2 = ranked2.find(s => s.symbol === 'UNH');

  console.log('UNH Rankings:');
  console.log(`  MC Rank: ${unh2.ranks.marketCap}`);
  console.log(`  ADTV Rank: ${unh2.ranks.adtv}`);
  console.log(`  P/S Rank: ${unh2.ranks.priceToSales}`);
  console.log(`  Growth Rank: ${unh2.ranks.salesGrowth}`);
  console.log(`  GF Rank: ${unh2.ranks.gfScore}`);
  console.log(`  Weighted Score: ${unh2.weightedScore.toFixed(2)}`);
  console.log(`  Overall Rank: ${unh2.overallRank}\n`);

  // Calculate manual weighted score
  const manual2 = (unh2.ranks.marketCap * 0.30) +
                   (unh2.ranks.adtv * 0.30) +
                   (unh2.ranks.priceToSales * 0.15) +
                   (unh2.ranks.salesGrowth * 0.15) +
                   (unh2.ranks.gfScore * 0.10);
  console.log(`  Manual calculation: ${manual2.toFixed(2)}`);
  console.log(`  Match: ${Math.abs(manual2 - unh2.weightedScore) < 0.01 ? '✓' : '✗'}\n`);

  // Analysis
  console.log('=== Analysis ===');
  console.log(`Overall rank changed from ${unh1.overallRank} → ${unh2.overallRank}`);
  console.log(`Weighted score changed from ${unh1.weightedScore.toFixed(2)} → ${unh2.weightedScore.toFixed(2)}`);

  const scoreDiff = unh2.weightedScore - unh1.weightedScore;
  console.log(`\nScore difference: ${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(2)}`);

  if (unh2.overallRank < unh1.overallRank) {
    console.log(`\n❌ BUG DETECTED: UNH improved rank despite having bad GF Rank (${unh2.ranks.gfScore})`);
    console.log(`   When GF weight increased from 0% to 10%, UNH should have gotten WORSE, not better!`);
  } else {
    console.log(`\n✓ Expected behavior: UNH rank worsened as expected`);
  }

  // Show top 20 stocks in both configs
  console.log(`\n=== Top 20 Comparison ===`);
  console.log(`Rank | Config 1 (35-35-15-15-0) | Config 2 (30-30-15-15-10)`);
  console.log(`-----|-------------------------|---------------------------`);

  for (let i = 0; i < 20; i++) {
    const s1 = ranked1[i];
    const s2 = ranked2[i];
    const unh1Marker = s1.symbol === 'UNH' ? ' ← UNH' : '';
    const unh2Marker = s2.symbol === 'UNH' ? ' ← UNH' : '';
    console.log(`${String(i + 1).padStart(4)} | ${s1.symbol.padEnd(23)}${unh1Marker} | ${s2.symbol.padEnd(27)}${unh2Marker}`);
  }

  process.exit(0);
})();
