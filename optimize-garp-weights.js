const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

/**
 * Generate weight combinations for all 10 metrics
 * Traditional: marketCap, adtv, priceToSales, salesGrowth, gfScore
 * GARP: peRatio, debtToEquity, operatingMargin, roic, fcfYield
 */
function generateGARPWeightCombinations() {
  const combinations = [];
  const step = 5;

  console.log('Generating weight combinations for all 10 metrics (Traditional + GARP)...');

  // Nested loops for all 10 metrics
  for (let mc = 0; mc <= 100; mc += step) {
    for (let adtv = 0; adtv <= 100 - mc; adtv += step) {
      for (let ps = 0; ps <= 100 - mc - adtv; ps += step) {
        for (let sg = 0; sg <= 100 - mc - adtv - ps; sg += step) {
          for (let gf = 0; gf <= 100 - mc - adtv - ps - sg; gf += step) {
            for (let pe = 0; pe <= 100 - mc - adtv - ps - sg - gf; pe += step) {
              for (let de = 0; de <= 100 - mc - adtv - ps - sg - gf - pe; de += step) {
                for (let om = 0; om <= 100 - mc - adtv - ps - sg - gf - pe - de; om += step) {
                  for (let roic = 0; roic <= 100 - mc - adtv - ps - sg - gf - pe - de - om; roic += step) {
                    const fcf = 100 - mc - adtv - ps - sg - gf - pe - de - om - roic;
                    if (fcf >= 0 && fcf <= 100 && fcf % step === 0) {
                      combinations.push({
                        marketCap: mc,
                        adtv: adtv,
                        priceToSales: ps,
                        salesGrowth: sg,
                        gfScore: gf,
                        peRatio: pe,
                        debtToEquity: de,
                        operatingMargin: om,
                        roic: roic,
                        fcfYield: fcf
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${combinations.length} total combinations`);
  return combinations;
}

async function testCombination(w, i, total, best, portfolioSizes) {
  try {
    const params = {
      marketCap: w.marketCap,
      adtv: w.adtv,
      priceToSales: w.priceToSales,
      salesGrowth: w.salesGrowth,
      gfScore: w.gfScore,
      peRatio: w.peRatio,
      debtToEquity: w.debtToEquity,
      operatingMargin: w.operatingMargin,
      roic: w.roic,
      fcfYield: w.fcfYield
    };

    const responses = await Promise.all(
      portfolioSizes.map(size =>
        axios.get(`${API_BASE}/stocks/annual-rebalance`, {
          params: { ...params, portfolioSize: size },
          timeout: 30000
        })
      )
    );

    const returns = portfolioSizes.map((size, idx) => {
      const data = responses[idx].data.data?.['5year'];
      if (!data?.transactions) return null;

      let cumulative = 1.0;
      for (let j = 0; j < data.transactions.length; j++) {
        if (data.transactions[j].action === 'BUY' && j+1 < data.transactions.length &&
            data.transactions[j+1].action === 'SELL_ALL') {
          const ret = ((data.transactions[j+1].portfolioValue - data.transactions[j].portfolioValue) /
                       data.transactions[j].portfolioValue) * 100;
          cumulative *= (1 + ret/100);
        }
      }

      return (cumulative - 1) * 100;
    });

    if (returns.some(r => r === null)) return null;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    if (i % 1000 === 0) {
      console.log(`${i}/${total} - Best Avg: ${best ? best.toFixed(2) : 'N/A'}%`);
    }

    return {
      weights: w,
      avgReturn: avgReturn,
      returns: {
        size10: returns[0],
        size15: returns[1],
        size20: returns[2]
      }
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   GARP WEIGHT OPTIMIZATION - ALL 10 METRICS                  ║');
  console.log('║   Finding Best 5-Year Return with Portfolio Sizes 10,15,20   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const combinations = generateGARPWeightCombinations();
  const portfolioSizes = [10, 15, 20];

  console.log(`Testing ${combinations.length} weight combinations...\n`);

  const results = [];
  let bestAvg = null;

  for (let i = 0; i < combinations.length; i++) {
    const result = await testCombination(combinations[i], i, combinations.length, bestAvg, portfolioSizes);

    if (result) {
      results.push(result);

      if (!bestAvg || result.avgReturn > bestAvg) {
        bestAvg = result.avgReturn;
        const w = result.weights;
        console.log(`\n🎯 NEW BEST! Avg: ${result.avgReturn.toFixed(2)}%`);
        console.log(`   Weights: MC=${w.marketCap} ADTV=${w.adtv} PS=${w.priceToSales} SG=${w.salesGrowth} GF=${w.gfScore}`);
        console.log(`           PE=${w.peRatio} DE=${w.debtToEquity} OM=${w.operatingMargin} ROIC=${w.roic} FCF=${w.fcfYield}`);
        console.log(`   Returns: 10=${result.returns.size10.toFixed(2)}%, 15=${result.returns.size15.toFixed(2)}%, 20=${result.returns.size20.toFixed(2)}%`);
      }
    }

    // Rate limiting
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Sort by average return
  results.sort((a, b) => b.avgReturn - a.avgReturn);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                      TOP 10 RESULTS                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const w = r.weights;
    console.log(`${i+1}. Avg Return: ${r.avgReturn.toFixed(2)}%`);
    console.log(`   Portfolio Returns: 10=${r.returns.size10.toFixed(2)}%, 15=${r.returns.size15.toFixed(2)}%, 20=${r.returns.size20.toFixed(2)}%`);
    console.log(`   Traditional: MC=${w.marketCap}% ADTV=${w.adtv}% PS=${w.priceToSales}% SG=${w.salesGrowth}% GF=${w.gfScore}%`);
    console.log(`   GARP: PE=${w.peRatio}% DE=${w.debtToEquity}% OM=${w.operatingMargin}% ROIC=${w.roic}% FCF=${w.fcfYield}%`);
    console.log('');
  }

  if (results.length > 0) {
    const best = results[0];
    const w = best.weights;
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    OPTIMAL CONFIGURATION                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`Average 5-Year Return: ${best.avgReturn.toFixed(2)}%`);
    console.log(`Portfolio Size 10: ${best.returns.size10.toFixed(2)}%`);
    console.log(`Portfolio Size 15: ${best.returns.size15.toFixed(2)}%`);
    console.log(`Portfolio Size 20: ${best.returns.size20.toFixed(2)}%\n`);
    console.log('Weights (Total = 100%):');
    console.log(`  Market Cap: ${w.marketCap}%`);
    console.log(`  ADTV: ${w.adtv}%`);
    console.log(`  P/S Ratio: ${w.priceToSales}%`);
    console.log(`  Sales Growth: ${w.salesGrowth}%`);
    console.log(`  GF Score: ${w.gfScore}%`);
    console.log(`  P/E Ratio: ${w.peRatio}%`);
    console.log(`  Debt/Equity: ${w.debtToEquity}%`);
    console.log(`  Operating Margin: ${w.operatingMargin}%`);
    console.log(`  ROIC: ${w.roic}%`);
    console.log(`  FCF Yield: ${w.fcfYield}%`);
    console.log(`\n$10,000 invested 5 years ago:`);
    console.log(`  Size 10: $${(10000 * (1 + best.returns.size10/100)).toFixed(2)}`);
    console.log(`  Size 15: $${(10000 * (1 + best.returns.size15/100)).toFixed(2)}`);
    console.log(`  Size 20: $${(10000 * (1 + best.returns.size20/100)).toFixed(2)}`);
  }
}

run().catch(console.error);
