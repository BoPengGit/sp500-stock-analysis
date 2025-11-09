const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Starting point - current best solution
const BEST_WEIGHTS = {
  marketCap: 5,
  adtv: 10,
  priceToSales: 10,
  salesGrowth: 30,
  gfScore: 5,
  peRatio: 5,
  debtToEquity: 15,
  operatingMargin: 5,
  roic: 10,
  fcfYield: 5
};

// All portfolio configurations to test (12 combinations)
const PORTFOLIO_CONFIGS = [
  { size: 5, threshold: 10 },
  { size: 5, threshold: 20 },
  { size: 5, threshold: 30 },
  { size: 10, threshold: 10 },
  { size: 10, threshold: 20 },
  { size: 10, threshold: 30 },
  { size: 15, threshold: 10 },
  { size: 15, threshold: 20 },
  { size: 15, threshold: 30 },
  { size: 20, threshold: 10 },
  { size: 20, threshold: 20 },
  { size: 20, threshold: 30 }
];

/**
 * Test a single portfolio configuration
 */
async function testSinglePortfolio(weights, portfolioSize, threshold) {
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
      portfolioSize: portfolioSize,
      keepThreshold: threshold
    };

    const response = await axios.get(`${API_BASE}/stocks/hold-winners`, {
      params,
      timeout: 30000
    });

    const data = response.data.data?.results?.['5year'];
    if (!data) return null;

    return data.totalReturn;
  } catch (e) {
    console.error(`Error testing portfolio: ${e.message}`);
    return null;
  }
}

/**
 * Evaluate fitness across all 12 portfolio configurations
 */
async function evaluateFitness(weights) {
  try {
    const results = [];

    for (const config of PORTFOLIO_CONFIGS) {
      const result = await testSinglePortfolio(weights, config.size, config.threshold);
      if (result === null) return { fitness: -Infinity, results: null };
      results.push(result);
    }

    const avgReturn = results.reduce((sum, r) => sum + r, 0) / results.length;
    const maxReturn = Math.max(...results);
    const minReturn = Math.min(...results);

    return {
      fitness: avgReturn,
      results: results,
      max: maxReturn,
      min: minReturn
    };
  } catch (e) {
    console.error(`Error evaluating fitness: ${e.message}`);
    return { fitness: -Infinity, results: null };
  }
}

/**
 * Generate neighbor solutions by making small adjustments
 */
function generateNeighbors(weights, stepSize = 5) {
  const neighbors = [];
  const keys = Object.keys(weights);

  // For each pair of weights, try moving weight from one to another
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;

      const key1 = keys[i];
      const key2 = keys[j];

      // Try moving stepSize from key1 to key2
      if (weights[key1] >= stepSize) {
        const neighbor = { ...weights };
        neighbor[key1] -= stepSize;
        neighbor[key2] += stepSize;
        neighbors.push(neighbor);
      }

      // Try moving 2*stepSize from key1 to key2
      if (weights[key1] >= 2 * stepSize) {
        const neighbor = { ...weights };
        neighbor[key1] -= 2 * stepSize;
        neighbor[key2] += 2 * stepSize;
        neighbors.push(neighbor);
      }
    }
  }

  return neighbors;
}

/**
 * Print weight configuration
 */
function printWeights(weights) {
  return `MC=${weights.marketCap} ADTV=${weights.adtv} PS=${weights.priceToSales} SG=${weights.salesGrowth} GF=${weights.gfScore} PE=${weights.peRatio} DE=${weights.debtToEquity} OM=${weights.operatingMargin} ROIC=${weights.roic} FCF=${weights.fcfYield}`;
}

/**
 * Local search optimization
 */
async function localSearch() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          LOCAL SEARCH FROM CURRENT BEST SOLUTION              ║');
  console.log('║   12 Configurations: 4 Sizes × 3 Thresholds                   ║');
  console.log('║   Strategy: Hold-Winners with Keep Thresholds                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Starting Point (Current Best):');
  console.log(`  ${printWeights(BEST_WEIGHTS)}`);
  console.log(`  Known fitness: 349.61%\n`);

  let currentWeights = { ...BEST_WEIGHTS };
  let currentFitness = null;
  let iteration = 0;
  const maxIterations = 50;

  // Evaluate starting point
  console.log('🔍 Evaluating starting point...');
  const startResult = await evaluateFitness(currentWeights);
  currentFitness = startResult.fitness;

  console.log(`✓ Starting fitness: ${currentFitness.toFixed(2)}%`);
  console.log(`  Range: ${startResult.min.toFixed(2)}% - ${startResult.max.toFixed(2)}%\n`);

  let bestWeights = { ...currentWeights };
  let bestFitness = currentFitness;
  let noImprovementCount = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${maxIterations}`);
    console.log(`   Current Best: ${bestFitness.toFixed(2)}%`);

    // Generate neighbors
    const neighbors = generateNeighbors(currentWeights, 5);
    console.log(`   Generated ${neighbors.length} neighbor solutions`);

    let foundImprovement = false;
    let bestNeighbor = null;
    let bestNeighborFitness = currentFitness;

    // Evaluate each neighbor
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];

      if (i % 10 === 0) {
        console.log(`   Evaluating neighbor ${i + 1}/${neighbors.length}...`);
      }

      const result = await evaluateFitness(neighbor);

      if (result.fitness > bestNeighborFitness) {
        bestNeighbor = neighbor;
        bestNeighborFitness = result.fitness;
        foundImprovement = true;

        console.log(`   🎯 Found improvement! ${result.fitness.toFixed(2)}% (${printWeights(neighbor)})`);
      }

      // Rate limiting
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (foundImprovement) {
      currentWeights = bestNeighbor;
      currentFitness = bestNeighborFitness;
      noImprovementCount = 0;

      if (bestNeighborFitness > bestFitness) {
        bestWeights = { ...bestNeighbor };
        bestFitness = bestNeighborFitness;

        console.log(`\n   🌟 NEW GLOBAL BEST! ${bestFitness.toFixed(2)}%`);
        console.log(`      ${printWeights(bestWeights)}`);
      }
    } else {
      noImprovementCount++;
      console.log(`   No improvement found (${noImprovementCount} iterations without improvement)`);

      if (noImprovementCount >= 5) {
        console.log(`\n⏹️  Stopping: No improvement for 5 consecutive iterations`);
        break;
      }
    }
  }

  // Final results
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    LOCAL SEARCH COMPLETE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Starting Solution:');
  console.log(`  ${printWeights(BEST_WEIGHTS)}`);
  console.log(`  Fitness: 349.61%\n`);

  console.log('Best Solution Found:');
  console.log(`  ${printWeights(bestWeights)}`);
  console.log(`  Fitness: ${bestFitness.toFixed(2)}%\n`);

  const improvement = bestFitness - 349.61;
  console.log(`Improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}%`);

  console.log('\nOptimal Weights (Total = 100%):');
  console.log(`  Market Cap: ${bestWeights.marketCap}%`);
  console.log(`  ADTV: ${bestWeights.adtv}%`);
  console.log(`  P/S Ratio: ${bestWeights.priceToSales}%`);
  console.log(`  Sales Growth: ${bestWeights.salesGrowth}%`);
  console.log(`  GF Score: ${bestWeights.gfScore}%`);
  console.log(`  P/E Ratio: ${bestWeights.peRatio}%`);
  console.log(`  Debt/Equity: ${bestWeights.debtToEquity}%`);
  console.log(`  Operating Margin: ${bestWeights.operatingMargin}%`);
  console.log(`  ROIC: ${bestWeights.roic}%`);
  console.log(`  FCF Yield: ${bestWeights.fcfYield}%`);

  console.log(`\nWeight Configuration String:`);
  console.log(`${bestWeights.marketCap}-${bestWeights.adtv}-${bestWeights.priceToSales}-${bestWeights.salesGrowth}-${bestWeights.gfScore}-${bestWeights.peRatio}-${bestWeights.debtToEquity}-${bestWeights.operatingMargin}-${bestWeights.roic}-${bestWeights.fcfYield}`);
}

localSearch().catch(console.error);
