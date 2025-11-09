const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Genetic Algorithm Configuration
const POPULATION_SIZE = 50;
const GENERATIONS = 100;
const MUTATION_RATE = 0.15;
const ELITE_SIZE = 5;
const TOURNAMENT_SIZE = 5;

// All portfolio configurations to test (12 combinations)
const PORTFOLIO_CONFIGS = [
  // 5 stocks with different thresholds
  { size: 5, threshold: 10 },
  { size: 5, threshold: 20 },
  { size: 5, threshold: 30 },
  // 10 stocks with different thresholds
  { size: 10, threshold: 10 },
  { size: 10, threshold: 20 },
  { size: 10, threshold: 30 },
  // 15 stocks with different thresholds
  { size: 15, threshold: 10 },
  { size: 15, threshold: 20 },
  { size: 15, threshold: 30 },
  // 20 stocks with different thresholds
  { size: 20, threshold: 10 },
  { size: 20, threshold: 20 },
  { size: 20, threshold: 30 }
];

/**
 * Generate a random weight configuration (10 metrics summing to 100)
 */
function generateRandomWeights() {
  const weights = Array(10).fill(0).map(() => Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);

  // Normalize to sum to 100 and round to multiples of 5
  const normalized = weights.map(w => Math.round((w / sum) * 100 / 5) * 5);

  // Fix rounding errors
  let total = normalized.reduce((a, b) => a + b, 0);
  while (total !== 100) {
    const idx = Math.floor(Math.random() * 10);
    if (total < 100 && normalized[idx] < 100) {
      normalized[idx] += 5;
      total += 5;
    } else if (total > 100 && normalized[idx] >= 5) {
      normalized[idx] -= 5;
      total -= 5;
    }
  }

  return {
    marketCap: normalized[0],
    adtv: normalized[1],
    priceToSales: normalized[2],
    salesGrowth: normalized[3],
    gfScore: normalized[4],
    peRatio: normalized[5],
    debtToEquity: normalized[6],
    operatingMargin: normalized[7],
    roic: normalized[8],
    fcfYield: normalized[9]
  };
}

/**
 * Test a single portfolio configuration and return 5-year return
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
      sellThreshold: threshold
    };

    const response = await axios.get(`${API_BASE}/stocks/annual-rebalance`, {
      params,
      timeout: 30000
    });

    const data = response.data.data?.results?.['5year'];
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
  } catch (e) {
    return null;
  }
}

/**
 * Test a weight configuration across ALL portfolio configs and return average fitness
 */
async function evaluateFitness(weights) {
  try {
    const results = [];

    // Test each of the 12 portfolio configurations
    for (const config of PORTFOLIO_CONFIGS) {
      const result = await testSinglePortfolio(weights, config.size, config.threshold);
      if (result === null) return { fitness: -Infinity, results: null, details: null };
      results.push(result);
    }

    // Calculate average return across ALL 12 configurations
    const avgReturn = results.reduce((sum, r) => sum + r, 0) / results.length;

    // Calculate statistics
    const maxReturn = Math.max(...results);
    const minReturn = Math.min(...results);

    return {
      fitness: avgReturn,
      results: results,
      details: {
        average: avgReturn,
        max: maxReturn,
        min: minReturn,
        range: maxReturn - minReturn
      }
    };
  } catch (e) {
    return { fitness: -Infinity, results: null, details: null };
  }
}

/**
 * Crossover two parent weight configurations
 */
function crossover(parent1, parent2) {
  const keys = Object.keys(parent1);
  const child = {};

  // Single-point crossover
  const crossoverPoint = Math.floor(Math.random() * keys.length);

  keys.forEach((key, idx) => {
    child[key] = idx < crossoverPoint ? parent1[key] : parent2[key];
  });

  // Normalize to sum to 100
  const total = Object.values(child).reduce((a, b) => a + b, 0);
  if (total !== 100) {
    const factor = 100 / total;
    keys.forEach(key => {
      child[key] = Math.round(child[key] * factor / 5) * 5;
    });

    // Fix rounding errors
    let sum = Object.values(child).reduce((a, b) => a + b, 0);
    while (sum !== 100) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      if (sum < 100 && child[randomKey] < 100) {
        child[randomKey] += 5;
        sum += 5;
      } else if (sum > 100 && child[randomKey] >= 5) {
        child[randomKey] -= 5;
        sum -= 5;
      }
    }
  }

  return child;
}

/**
 * Mutate a weight configuration
 */
function mutate(weights) {
  if (Math.random() > MUTATION_RATE) return weights;

  const keys = Object.keys(weights);
  const mutated = { ...weights };

  // Randomly adjust two weights
  const idx1 = Math.floor(Math.random() * keys.length);
  let idx2 = Math.floor(Math.random() * keys.length);
  while (idx2 === idx1) idx2 = Math.floor(Math.random() * keys.length);

  const key1 = keys[idx1];
  const key2 = keys[idx2];

  const change = (Math.floor(Math.random() * 4) + 1) * 5; // 5, 10, 15, or 20

  if (mutated[key1] >= change && mutated[key2] + change <= 100) {
    mutated[key1] -= change;
    mutated[key2] += change;
  }

  return mutated;
}

/**
 * Tournament selection
 */
function tournamentSelect(population) {
  const tournament = [];
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    tournament.push(population[Math.floor(Math.random() * population.length)]);
  }
  return tournament.reduce((best, current) =>
    current.fitness > best.fitness ? current : best
  );
}

/**
 * Main genetic algorithm
 */
async function runGeneticAlgorithm() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE MULTI-PORTFOLIO OPTIMIZATION                  ║');
  console.log('║   12 Configurations: 4 Sizes × 3 Thresholds                   ║');
  console.log('║   Optimizing for AVERAGE return across ALL configurations     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Portfolio Configurations (12 total):');
  PORTFOLIO_CONFIGS.forEach((config, i) => {
    console.log(`  ${i+1}. ${config.size} stocks, rank ${config.threshold} threshold`);
  });
  console.log();

  // Initialize population
  console.log('Generating initial population...');
  let population = [];

  for (let i = 0; i < POPULATION_SIZE; i++) {
    const weights = generateRandomWeights();
    population.push({ weights, fitness: null, results: null, details: null });
  }

  let globalBest = null;
  let generationsWithoutImprovement = 0;

  // Evolution loop
  for (let gen = 0; gen < GENERATIONS; gen++) {
    console.log(`\n🧬 Generation ${gen + 1}/${GENERATIONS}`);

    // Evaluate fitness for all individuals
    for (let i = 0; i < population.length; i++) {
      if (population[i].fitness === null) {
        const result = await evaluateFitness(population[i].weights);
        population[i].fitness = result.fitness;
        population[i].results = result.results;
        population[i].details = result.details;

        // Rate limiting
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

    // Track best
    const genBest = population[0];
    if ((!globalBest || genBest.fitness > globalBest.fitness) && genBest.fitness !== -Infinity && genBest.results !== null) {
      globalBest = { ...genBest };
      generationsWithoutImprovement = 0;

      const w = genBest.weights;
      console.log(`\n🎯 NEW GLOBAL BEST! Average 5-Year Return: ${genBest.fitness.toFixed(2)}%`);
      console.log(`   Traditional: MC=${w.marketCap} ADTV=${w.adtv} PS=${w.priceToSales} SG=${w.salesGrowth} GF=${w.gfScore}`);
      console.log(`   GARP: PE=${w.peRatio} DE=${w.debtToEquity} OM=${w.operatingMargin} ROIC=${w.roic} FCF=${w.fcfYield}`);
      console.log(`   Range: ${genBest.details.min.toFixed(2)}% - ${genBest.details.max.toFixed(2)}%`);
    } else {
      generationsWithoutImprovement++;
    }

    console.log(`   Best: ${genBest.fitness.toFixed(2)}% | Avg: ${(population.reduce((s, p) => s + p.fitness, 0) / population.length).toFixed(2)}% | Worst: ${population[population.length - 1].fitness.toFixed(2)}%`);

    // Early stopping if no improvement for 20 generations
    if (generationsWithoutImprovement >= 20) {
      console.log(`\n⏹️  Early stopping: No improvement for 20 generations`);
      break;
    }

    // Create next generation
    const nextGen = [];

    // Elitism - keep top performers
    for (let i = 0; i < ELITE_SIZE; i++) {
      nextGen.push({ ...population[i], fitness: null, results: null, details: null });
    }

    // Generate offspring
    while (nextGen.length < POPULATION_SIZE) {
      const parent1 = tournamentSelect(population);
      const parent2 = tournamentSelect(population);

      let childWeights = crossover(parent1.weights, parent2.weights);
      childWeights = mutate(childWeights);

      nextGen.push({ weights: childWeights, fitness: null, results: null, details: null });
    }

    population = nextGen;
  }

  // Final results
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    OPTIMIZATION COMPLETE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const w = globalBest.weights;
  console.log(`Average 5-Year Return (across 12 configs): ${globalBest.fitness.toFixed(2)}%\n`);

  console.log('Returns by Configuration:');
  globalBest.results.forEach((ret, i) => {
    const config = PORTFOLIO_CONFIGS[i];
    console.log(`  ${config.size} stocks @ rank ${config.threshold} threshold: ${ret.toFixed(2)}%`);
  });

  console.log('\nStatistics:');
  console.log(`  Average: ${globalBest.details.average.toFixed(2)}%`);
  console.log(`  Best: ${globalBest.details.max.toFixed(2)}%`);
  console.log(`  Worst: ${globalBest.details.min.toFixed(2)}%`);
  console.log(`  Range: ${globalBest.details.range.toFixed(2)}%`);

  console.log('\nOptimal Weights (Total = 100%):');
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

  console.log(`\n$10,000 invested 5 years ago → $${(10000 * (1 + globalBest.fitness/100)).toFixed(2)} (average across all configs)`);

  console.log(`\nWeight Configuration String:`);
  console.log(`${w.marketCap}-${w.adtv}-${w.priceToSales}-${w.salesGrowth}-${w.gfScore}-${w.peRatio}-${w.debtToEquity}-${w.operatingMargin}-${w.roic}-${w.fcfYield}`);
}

runGeneticAlgorithm().catch(console.error);
