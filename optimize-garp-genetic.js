const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Genetic Algorithm Configuration
const POPULATION_SIZE = 50;
const GENERATIONS = 100;
const MUTATION_RATE = 0.15;
const ELITE_SIZE = 5;
const TOURNAMENT_SIZE = 5;

/**
 * Generate a random weight configuration (10 metrics summing to 100)
 * 5 traditional metrics + 5 GARP metrics (excluding PEG)
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
 * Test a weight configuration and return fitness (5-year return for portfolio size 15)
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
    if (!data?.transactions) return { fitness: -Infinity, return5yr: null };

    let cumulative = 1.0;
    for (let j = 0; j < data.transactions.length; j++) {
      if (data.transactions[j].action === 'BUY' && j+1 < data.transactions.length &&
          data.transactions[j+1].action === 'SELL_ALL') {
        const ret = ((data.transactions[j+1].portfolioValue - data.transactions[j].portfolioValue) /
                     data.transactions[j].portfolioValue) * 100;
        cumulative *= (1 + ret/100);
      }
    }

    const totalReturn = (cumulative - 1) * 100;

    return {
      fitness: totalReturn,
      return5yr: totalReturn
    };
  } catch (e) {
    return { fitness: -Infinity, return5yr: null };
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
  console.log('║   GENETIC ALGORITHM - 10 METRIC WEIGHT OPTIMIZATION          ║');
  console.log('║   Population: 50 | Generations: 100 | Mutation: 15%          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Initialize population
  console.log('Generating initial population...');
  let population = [];

  for (let i = 0; i < POPULATION_SIZE; i++) {
    const weights = generateRandomWeights();
    population.push({ weights, fitness: null, returns: null });
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
        population[i].returns = result.returns;

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
    if ((!globalBest || genBest.fitness > globalBest.fitness) && genBest.fitness !== -Infinity && genBest.return5yr !== null) {
      globalBest = { ...genBest };
      generationsWithoutImprovement = 0;

      const w = genBest.weights;
      console.log(`\n🎯 NEW GLOBAL BEST! 5-Year Return: ${genBest.fitness.toFixed(2)}% (Portfolio Size 15)`);
      console.log(`   Traditional: MC=${w.marketCap} ADTV=${w.adtv} PS=${w.priceToSales} SG=${w.salesGrowth} GF=${w.gfScore}`);
      console.log(`   GARP: PE=${w.peRatio} DE=${w.debtToEquity} OM=${w.operatingMargin} ROIC=${w.roic} FCF=${w.fcfYield}`);
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
      nextGen.push({ ...population[i], fitness: null, returns: null });
    }

    // Generate offspring
    while (nextGen.length < POPULATION_SIZE) {
      const parent1 = tournamentSelect(population);
      const parent2 = tournamentSelect(population);

      let childWeights = crossover(parent1.weights, parent2.weights);
      childWeights = mutate(childWeights);

      nextGen.push({ weights: childWeights, fitness: null, returns: null });
    }

    population = nextGen;
  }

  // Final results
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    OPTIMIZATION COMPLETE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const w = globalBest.weights;
  console.log(`5-Year Return (Portfolio Size 15): ${globalBest.fitness.toFixed(2)}%\n`);

  console.log('Optimal Weights (Total = 100%):');
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

  console.log(`\n$10,000 invested 5 years ago → $${(10000 * (1 + globalBest.fitness/100)).toFixed(2)}`);

  console.log(`\nWeight Configuration String:`);
  console.log(`${w.marketCap}-${w.adtv}-${w.priceToSales}-${w.salesGrowth}-${w.gfScore}-${w.peRatio}-${w.debtToEquity}-${w.operatingMargin}-${w.roic}-${w.fcfYield}`);
}

runGeneticAlgorithm().catch(console.error);
