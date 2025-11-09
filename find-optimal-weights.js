const axios = require('axios');

async function testWeightCombination(marketCap, adtv, priceToSales, salesGrowth, gfScore) {
  try {
    const response = await axios.get('http://localhost:5000/api/stocks/annual-rebalance', {
      params: {
        marketCap,
        adtv,
        priceToSales,
        salesGrowth,
        gfScore,
        refresh: 'false' // Use cached data when possible
      }
    });

    if (response.data.success) {
      return {
        weights: { marketCap, adtv, priceToSales, salesGrowth, gfScore },
        fiveYearReturn: response.data.data.summary['5year'],
        fourYearReturn: response.data.data.summary['4year'],
        threeYearReturn: response.data.data.summary['3year'],
        twoYearReturn: response.data.data.summary['2year'],
        oneYearReturn: response.data.data.summary['1year']
      };
    }
  } catch (error) {
    console.error(`Error testing combination MC=${marketCap} ADTV=${adtv} PS=${priceToSales} SG=${salesGrowth} GF=${gfScore}:`, error.message);
    return null;
  }
}

async function findOptimalWeights() {
  console.log('='.repeat(80));
  console.log('FINDING OPTIMAL WEIGHT COMBINATION FOR 5-YEAR RETURN');
  console.log('='.repeat(80));
  console.log('');

  const results = [];

  // Generate combinations in steps of 5%
  // Must sum to 100
  const step = 5;
  let tested = 0;
  let skipped = 0;

  console.log('Testing weight combinations (5% increments)...\n');

  for (let mc = 0; mc <= 100; mc += step) {
    for (let adtv = 0; adtv <= 100 - mc; adtv += step) {
      for (let ps = 0; ps <= 100 - mc - adtv; ps += step) {
        for (let sg = 0; sg <= 100 - mc - adtv - ps; sg += step) {
          const gf = 100 - mc - adtv - ps - sg;

          if (gf >= 0 && gf <= 100 && gf % step === 0) {
            tested++;

            // Progress indicator
            if (tested % 100 === 0) {
              process.stdout.write(`\rTested ${tested} combinations...`);
            }

            const result = await testWeightCombination(mc, adtv, ps, sg, gf);
            if (result) {
              results.push(result);
            } else {
              skipped++;
            }

            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    }
  }

  console.log(`\n\nCompleted testing ${tested} combinations (${skipped} failed)\n`);

  // Sort by 5-year return (descending)
  results.sort((a, b) => b.fiveYearReturn - a.fiveYearReturn);

  // Display top 20 configurations
  console.log('='.repeat(80));
  console.log('TOP 20 WEIGHT CONFIGURATIONS BY 5-YEAR RETURN');
  console.log('='.repeat(80));
  console.log('');
  console.log('Rank | MC% | ADTV% | P/S% | SG% | GF% | 5Y Return | 4Y    | 3Y    | 2Y    | 1Y');
  console.log('-'.repeat(80));

  results.slice(0, 20).forEach((result, index) => {
    const w = result.weights;
    console.log(
      `${String(index + 1).padStart(4)} | ` +
      `${String(w.marketCap).padStart(3)} | ` +
      `${String(w.adtv).padStart(5)} | ` +
      `${String(w.priceToSales).padStart(4)} | ` +
      `${String(w.salesGrowth).padStart(3)} | ` +
      `${String(w.gfScore).padStart(3)} | ` +
      `${result.fiveYearReturn.toFixed(2)}%`.padStart(9) + ` | ` +
      `${result.fourYearReturn.toFixed(2)}% | `.padStart(7) +
      `${result.threeYearReturn.toFixed(2)}% | `.padStart(7) +
      `${result.twoYearReturn.toFixed(2)}% | `.padStart(7) +
      `${result.oneYearReturn.toFixed(2)}%`.padStart(6)
    );
  });

  console.log('');
  console.log('='.repeat(80));
  console.log('OPTIMAL CONFIGURATION (Highest 5-Year Return):');
  console.log('='.repeat(80));
  const best = results[0];
  console.log(`Market Cap Weight:    ${best.weights.marketCap}%`);
  console.log(`ADTV Weight:          ${best.weights.adtv}%`);
  console.log(`Price/Sales Weight:   ${best.weights.priceToSales}%`);
  console.log(`Sales Growth Weight:  ${best.weights.salesGrowth}%`);
  console.log(`GF Score Weight:      ${best.weights.gfScore}%`);
  console.log('');
  console.log(`5-Year Return:        ${best.fiveYearReturn.toFixed(2)}%`);
  console.log(`4-Year Return:        ${best.fourYearReturn.toFixed(2)}%`);
  console.log(`3-Year Return:        ${best.threeYearReturn.toFixed(2)}%`);
  console.log(`2-Year Return:        ${best.twoYearReturn.toFixed(2)}%`);
  console.log(`1-Year Return:        ${best.oneYearReturn.toFixed(2)}%`);
  console.log('='.repeat(80));
}

findOptimalWeights().catch(console.error);
