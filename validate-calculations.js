const axios = require('axios');

async function validateCalculations() {
  console.log('\n=== VALIDATING HISTORICAL STOCK CALCULATIONS ===\n');

  const weights = {
    marketCap: 20,
    adtv: 20,
    priceToSales: 25,
    salesGrowth: 25,
    gfScore: 10
  };

  // Test Year 2 with Citigroup (C) example from user
  const year = 2;

  try {
    const response = await axios.get(`http://localhost:5000/api/stocks/historical-top-stocks`, {
      params: {
        yearsAgo: year,
        limit: 10,
        marketCap: weights.marketCap,
        adtv: weights.adtv,
        priceToSales: weights.priceToSales,
        salesGrowth: weights.salesGrowth,
        gfScore: weights.gfScore
      }
    });

    if (!response.data.success) {
      console.log(`❌ API Error: ${response.data.error}`);
      return;
    }

    const stocks = response.data.data;
    const citigroup = stocks.find(s => s.symbol === 'C');

    if (!citigroup) {
      console.log('❌ Citigroup (C) not found in top 10 for year 2');
      return;
    }

    console.log(`Testing Citigroup (C) from ${year} years ago\n`);
    console.log(`Weight Configuration: ${weights.marketCap}-${weights.adtv}-${weights.priceToSales}-${weights.salesGrowth}-${weights.gfScore}`);
    console.log('');

    // Display the stock data
    console.log('Stock Data:');
    console.log(`  Symbol: ${citigroup.symbol}`);
    console.log(`  Name: ${citigroup.name}`);
    console.log(`  Market Cap: $${(citigroup.marketCap / 1e9).toFixed(2)}B`);
    console.log(`  ADTV: ${(citigroup.adtv / 1e6).toFixed(2)}M`);
    console.log(`  Price/Sales: ${citigroup.priceToSales?.toFixed(2)}`);
    console.log(`  Sales Growth: ${citigroup.salesGrowth?.toFixed(2)}%`);
    console.log(`  GF Score: ${citigroup.gfScore}`);
    console.log('');

    // Display ranks
    console.log('Percentile Ranks:');
    console.log(`  Market Cap Rank: ${citigroup.ranks?.marketCap}`);
    console.log(`  ADTV Rank: ${citigroup.ranks?.adtv}`);
    console.log(`  P/S Rank: ${citigroup.ranks?.priceToSales}`);
    console.log(`  Sales Growth Rank: ${citigroup.ranks?.salesGrowth}`);
    console.log(`  GF Score Rank: ${citigroup.ranks?.gfScore}`);
    console.log('');

    // Calculate weighted score manually
    const mcRank = citigroup.ranks?.marketCap || 0;
    const adtvRank = citigroup.ranks?.adtv || 0;
    const psRank = citigroup.ranks?.priceToSales || 0;
    const sgRank = citigroup.ranks?.salesGrowth || 0;
    const gfRank = citigroup.ranks?.gfScore || 0;

    const calculatedScore =
      (mcRank * weights.marketCap / 100) +
      (adtvRank * weights.adtv / 100) +
      (psRank * weights.priceToSales / 100) +
      (sgRank * weights.salesGrowth / 100) +
      (gfRank * weights.gfScore / 100);

    const reportedScore = citigroup.weightedScore;

    console.log('Weighted Score Calculation:');
    console.log(`  (${mcRank} × ${weights.marketCap}%) + (${adtvRank} × ${weights.adtv}%) + (${psRank} × ${weights.priceToSales}%) + (${sgRank} × ${weights.salesGrowth}%) + (${gfRank} × ${weights.gfScore}%)`);
    console.log(`  = (${mcRank} × 0.${weights.marketCap}) + (${adtvRank} × 0.${weights.adtv}) + (${psRank} × 0.${weights.priceToSales}) + (${sgRank} × 0.${weights.salesGrowth}) + (${gfRank} × 0.${weights.gfScore})`);
    console.log(`  = ${(mcRank * weights.marketCap / 100).toFixed(2)} + ${(adtvRank * weights.adtv / 100).toFixed(2)} + ${(psRank * weights.priceToSales / 100).toFixed(2)} + ${(sgRank * weights.salesGrowth / 100).toFixed(2)} + ${(gfRank * weights.gfScore / 100).toFixed(2)}`);
    console.log(`  = ${calculatedScore.toFixed(2)}`);
    console.log('');
    console.log(`Reported Score: ${reportedScore.toFixed(2)}`);
    console.log(`Calculated Score: ${calculatedScore.toFixed(2)}`);
    console.log('');

    const difference = Math.abs(calculatedScore - reportedScore);
    if (difference < 0.01) {
      console.log(`✅ CALCULATION CORRECT! (difference: ${difference.toFixed(4)})`);
    } else {
      console.log(`❌ CALCULATION MISMATCH! (difference: ${difference.toFixed(4)})`);
    }

    console.log('\n=== VALIDATING ALL TOP 10 STOCKS ===\n');

    let allCorrect = true;
    stocks.forEach((stock, index) => {
      const mcR = stock.ranks?.marketCap || 0;
      const adtvR = stock.ranks?.adtv || 0;
      const psR = stock.ranks?.priceToSales || 0;
      const sgR = stock.ranks?.salesGrowth || 0;
      const gfR = stock.ranks?.gfScore || 0;

      const calc =
        (mcR * weights.marketCap / 100) +
        (adtvR * weights.adtv / 100) +
        (psR * weights.priceToSales / 100) +
        (sgR * weights.salesGrowth / 100) +
        (gfR * weights.gfScore / 100);

      const diff = Math.abs(calc - stock.weightedScore);
      const status = diff < 0.01 ? '✅' : '❌';

      console.log(`${index + 1}. ${stock.symbol.padEnd(6)} Score: ${stock.weightedScore.toFixed(2)} (Calc: ${calc.toFixed(2)}, Diff: ${diff.toFixed(4)}) ${status}`);

      if (diff >= 0.01) {
        allCorrect = false;
      }
    });

    console.log('\n' + '='.repeat(60));
    if (allCorrect) {
      console.log('✅ ALL CALCULATIONS VERIFIED CORRECT!');
    } else {
      console.log('❌ SOME CALCULATIONS HAVE ERRORS!');
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

validateCalculations();
