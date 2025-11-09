const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Best known configuration from genetic algorithm
const BASE_WEIGHTS = {
  marketCap: 5,
  adtv: 30,
  priceToSales: 5,
  salesGrowth: 50,
  gfScore: 5,
  peRatio: 5,
  debtToEquity: 0,
  operatingMargin: 0,
  roic: 0,
  fcfYield: 0
};

/**
 * Test a weight configuration and return 5-year return
 */
async function evaluateFitness(weights) {
  try {
    const params = {
      marketCap: weights.marketCap,
      adtv: weights.adtv,
      priceToSales: weights.priceToSales,
      salesGrowth: weights.salesGrowth,
      gfScore: weights.gfScore,
      peRatio: weights.peRatio,
      debtToEquity: weights.debtToEquity,
      operatingMargin: weights.operatingMargin,
      roic: weights.roic,
      fcfYield: weights.fcfYield,
      portfolioSize: 15
    };

    const response = await axios.get(`${API_BASE}/stocks/annual-rebalance`, {
      params,
      timeout: 30000
    });

    const data = response.data.data?.results?.['5year'];
    if (!data?.transactions) return -Infinity;

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
  } catch (e) {
    console.error(`Error evaluating weights: ${e.message}`);
    return -Infinity;
  }
}

/**
 * Generate neighbor configurations by adjusting weights by ±5 or ±10
 */
function generateNeighbors(weights) {
  const neighbors = [];
  const keys = Object.keys(weights);
  const deltas = [5, 10, -5, -10];

  // For each pair of metrics, try transferring weight
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;

      const key1 = keys[i];
      const key2 = keys[j];

      for (const delta of deltas) {
        if (weights[key1] >= Math.abs(delta)) {
          const neighbor = { ...weights };
          neighbor[key1] -= Math.abs(delta);
          neighbor[key2] += Math.abs(delta);

          // Validate weights sum to 100 and are non-negative
          const sum = Object.values(neighbor).reduce((a, b) => a + b, 0);
          const allValid = Object.values(neighbor).every(v => v >= 0 && v <= 100);

          if (sum === 100 && allValid) {
            neighbors.push(neighbor);
          }
        }
      }
    }
  }

  return neighbors;
}

/**
 * Local search optimization starting from base weights
 */
async function localSearch() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║            LOCAL SEARCH - WEIGHT OPTIMIZATION                 ║');
  console.log('║   Starting from: 5-30-5-50-5-5-0-0-0-0 (726.38% return)      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let currentWeights = { ...BASE_WEIGHTS };
  let currentFitness = await evaluateFitness(currentWeights);

  console.log(`Base Configuration Return: ${currentFitness.toFixed(2)}%`);
  console.log(`  MC=${currentWeights.marketCap} ADTV=${currentWeights.adtv} PS=${currentWeights.priceToSales} SG=${currentWeights.salesGrowth} GF=${currentWeights.gfScore}`);
  console.log(`  PE=${currentWeights.peRatio} DE=${currentWeights.debtToEquity} OM=${currentWeights.operatingMargin} ROIC=${currentWeights.roic} FCF=${currentWeights.fcfYield}\n`);

  let iteration = 0;
  let maxIterations = 50;
  let improvements = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n🔍 Iteration ${iteration}/${maxIterations}`);

    // Generate all neighbors
    const neighbors = generateNeighbors(currentWeights);
    console.log(`   Generated ${neighbors.length} neighbor configurations`);

    // Test each neighbor
    let bestNeighbor = null;
    let bestNeighborFitness = currentFitness;

    for (let i = 0; i < neighbors.length; i++) {
      const fitness = await evaluateFitness(neighbors[i]);

      if (fitness > bestNeighborFitness) {
        bestNeighbor = neighbors[i];
        bestNeighborFitness = fitness;
      }

      // Rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Check if we found an improvement
    if (bestNeighbor && bestNeighborFitness > currentFitness) {
      improvements++;
      const improvement = bestNeighborFitness - currentFitness;

      console.log(`\n   🎯 IMPROVEMENT FOUND! +${improvement.toFixed(2)}% (${currentFitness.toFixed(2)}% → ${bestNeighborFitness.toFixed(2)}%)`);
      console.log(`      Traditional: MC=${bestNeighbor.marketCap} ADTV=${bestNeighbor.adtv} PS=${bestNeighbor.priceToSales} SG=${bestNeighbor.salesGrowth} GF=${bestNeighbor.gfScore}`);
      console.log(`      GARP: PE=${bestNeighbor.peRatio} DE=${bestNeighbor.debtToEquity} OM=${bestNeighbor.operatingMargin} ROIC=${bestNeighbor.roic} FCF=${bestNeighbor.fcfYield}`);

      currentWeights = bestNeighbor;
      currentFitness = bestNeighborFitness;
    } else {
      console.log(`   No improvement found. Current best: ${currentFitness.toFixed(2)}%`);

      // If no improvement for 3 iterations, stop
      if (iteration > 3 && improvements === 0) {
        console.log('\n   ⏹️  No improvements found in recent iterations. Stopping.');
        break;
      }
    }
  }

  // Final results
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                LOCAL SEARCH COMPLETE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`Final 5-Year Return: ${currentFitness.toFixed(2)}%`);
  console.log(`Total Improvements: ${improvements}\n`);

  console.log('Optimal Weights (Total = 100%):');
  console.log(`  Market Cap: ${currentWeights.marketCap}%`);
  console.log(`  ADTV: ${currentWeights.adtv}%`);
  console.log(`  P/S Ratio: ${currentWeights.priceToSales}%`);
  console.log(`  Sales Growth: ${currentWeights.salesGrowth}%`);
  console.log(`  GF Score: ${currentWeights.gfScore}%`);
  console.log(`  P/E Ratio: ${currentWeights.peRatio}%`);
  console.log(`  Debt/Equity: ${currentWeights.debtToEquity}%`);
  console.log(`  Operating Margin: ${currentWeights.operatingMargin}%`);
  console.log(`  ROIC: ${currentWeights.roic}%`);
  console.log(`  FCF Yield: ${currentWeights.fcfYield}%`);

  console.log(`\n$10,000 invested 5 years ago → $${(10000 * (1 + currentFitness/100)).toFixed(2)}`);

  console.log(`\nWeight Configuration String:`);
  console.log(`${currentWeights.marketCap}-${currentWeights.adtv}-${currentWeights.priceToSales}-${currentWeights.salesGrowth}-${currentWeights.gfScore}-${currentWeights.peRatio}-${currentWeights.debtToEquity}-${currentWeights.operatingMargin}-${currentWeights.roic}-${currentWeights.fcfYield}`);
}

localSearch().catch(console.error);
