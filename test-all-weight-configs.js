const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Generate all possible weight combinations (5% increments)
function generateWeightCombinations() {
  const combinations = [];
  const step = 5;

  console.log('Generating all possible weight combinations (5% increments)...');

  for (let mc = 0; mc <= 100; mc += step) {
    for (let adtv = 0; adtv <= 100 - mc; adtv += step) {
      for (let ps = 0; ps <= 100 - mc - adtv; ps += step) {
        for (let sg = 0; sg <= 100 - mc - adtv - ps; sg += step) {
          const gf = 100 - mc - adtv - ps - sg;
          if (gf >= 0 && gf <= 100 && gf % step === 0) {
            combinations.push({
              marketCap: mc,
              adtv: adtv,
              priceToSales: ps,
              salesGrowth: sg,
              gfScore: gf,
              label: `MC:${mc} ADTV:${adtv} PS:${ps} SG:${sg} GF:${gf}`
            });
          }
        }
      }
    }
  }

  console.log(`Generated ${combinations.length} total combinations\n`);
  return combinations;
}

const weightConfigs = {}; // Will be populated by generateWeightCombinations()

async function testWeightConfig(configKey, weights, index, total) {
  // Only show details for first few and then every 100th
  if (index < 3 || index % 100 === 0) {
    console.log(`\nTesting [${index}/${total}]: ${weights.label}`);
  }

  try {
    const response = await axios.get(`${API_BASE}/stocks/annual-rebalance`, {
      params: {
        marketCap: weights.marketCap,
        adtv: weights.adtv,
        priceToSales: weights.priceToSales,
        salesGrowth: weights.salesGrowth,
        gfScore: weights.gfScore
      }
    });

    if (response.data.success) {
      const data = response.data.data;
      const period5Data = data['5year'];

      if (!period5Data || !period5Data.transactions) {
        console.log(`  ⚠️  No 5-year data available`);
        return null;
      }

      // Parse transactions to get year-by-year returns
      const transactions = period5Data.transactions;
      const yearReturns = [];

      // Process transactions in pairs (BUY followed by SELL_ALL)
      for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];

        if (txn.action === 'BUY') {
          const nextIndex = i + 1;
          if (nextIndex < transactions.length && transactions[nextIndex].action === 'SELL_ALL') {
            const sellTxn = transactions[nextIndex];
            const startValue = txn.portfolioValue;
            const endValue = sellTxn.portfolioValue;
            const yearReturn = ((endValue - startValue) / startValue) * 100;

            yearReturns.push({
              year: txn.yearsAgo,
              return: yearReturn,
              stocks: txn.count
            });
          }
        }
      }

      // Calculate cumulative return
      let cumulativeReturn = 1.0;
      for (const yr of yearReturns) {
        const returnMultiplier = 1 + (yr.return / 100);
        cumulativeReturn *= returnMultiplier;
      }

      const totalReturn = (cumulativeReturn - 1) * 100;
      const avgAnnualReturn = yearReturns.reduce((sum, yr) => sum + yr.return, 0) / yearReturns.length;

      console.log(`\nYear-by-Year Returns:`);
      for (const yr of yearReturns.reverse()) {
        console.log(`  Year ${yr.year}: ${yr.return > 0 ? '+' : ''}${yr.return.toFixed(2)}% (${yr.stocks} stocks)`);
      }

      console.log(`\n5-Year Results:`);
      console.log(`  Cumulative Return: ${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
      console.log(`  Average Annual Return: ${avgAnnualReturn > 0 ? '+' : ''}${avgAnnualReturn.toFixed(2)}%`);
      console.log(`  $10,000 → $${(10000 * cumulativeReturn).toFixed(2)}`);

      return {
        config: configKey,
        label: weights.label,
        cumulativeReturn: totalReturn,
        avgAnnualReturn: avgAnnualReturn,
        yearReturns: yearReturns,
        finalValue: 10000 * cumulativeReturn
      };
    } else {
      console.log(`  ❌ ERROR: ${response.data.error || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return null;
  }
}

let bestResult = null;

async function runAllTests() {
  console.log('\n' + '█'.repeat(80));
  console.log('WEIGHT OPTIMIZATION - FINDING BEST 5-YEAR RETURN COMBINATION');
  console.log('Testing ALL possible weight combinations (5% increments)');
  console.log('█'.repeat(80));

  const combinations = generateWeightCombinations();
  const results = [];

  for (let i = 0; i < combinations.length; i++) {
    const weights = combinations[i];
    const result = await testWeightConfig(i, weights, i, combinations.length);
    if (result) {
      results.push(result);

      // Track and display best result
      if (!bestResult || result.cumulativeReturn > bestResult.cumulativeReturn) {
        bestResult = result;
        console.log(`\n🎯 NEW BEST! ${result.cumulativeReturn.toFixed(2)}% - ${result.label}\n`);
      }
    }
    // Progress update and small delay
    if (i % 100 === 0) {
      console.log(`Progress: ${i}/${combinations.length} (${((i/combinations.length)*100).toFixed(1)}%)`);
    }
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Sort by cumulative return (best first)
  results.sort((a, b) => b.cumulativeReturn - a.cumulativeReturn);

  console.log('\n\n' + '█'.repeat(80));
  console.log('FINAL RANKING - 5-YEAR CUMULATIVE RETURNS');
  console.log('█'.repeat(80));

  results.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
    console.log(`\n${medal} #${index + 1}: ${result.label}`);
    console.log(`   Cumulative Return: ${result.cumulativeReturn > 0 ? '+' : ''}${result.cumulativeReturn.toFixed(2)}%`);
    console.log(`   Avg Annual Return: ${result.avgAnnualReturn > 0 ? '+' : ''}${result.avgAnnualReturn.toFixed(2)}%`);
    console.log(`   $10,000 → $${result.finalValue.toFixed(2)}`);
  });

  console.log('\n' + '█'.repeat(80));
  console.log(`🏆 WINNER: ${results[0].label}`);
  console.log(`   ${results[0].cumulativeReturn > 0 ? '+' : ''}${results[0].cumulativeReturn.toFixed(2)}% total return over 5 years`);
  console.log('█'.repeat(80) + '\n');
}

runAllTests().catch(console.error);
