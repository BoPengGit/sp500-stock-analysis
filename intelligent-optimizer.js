const holdWinnersService = require('./server/services/holdWinnersService');
const { initializeDatabase } = require('./server/database/db');

/**
 * Intelligent Weight Optimizer using Gradient-Free Optimization
 *
 * Optimization Metric: Average 5-year return across ALL portfolio configurations:
 * - Portfolio sizes: 5, 10, 15, 20 stocks
 * - Keep thresholds: 10, 20, 30 (must drop to this rank to be replaced)
 * - Total: 12 combinations (4 sizes × 3 thresholds)
 */

// Portfolio configurations to test
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
 * Evaluate a weight configuration across all portfolio setups
 * Returns the average 5-year return
 */
async function evaluateWeights(weights) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`EVALUATING WEIGHTS: MC=${weights.marketCap}% ADTV=${weights.adtv}% P/S=${weights.priceToSales}% SG=${weights.salesGrowth}% GF=${weights.gfScore}%`);
  console.log('='.repeat(80));

  const results = [];

  for (const config of PORTFOLIO_CONFIGS) {
    try {
      console.log(`\n  Testing: ${config.size} stocks, threshold=${config.threshold}...`);

      const result = await holdWinnersService.calculateHoldWinnersReturn(
        5, // 5 years
        config.size,
        config.threshold,
        weights
      );

      const fiveYearReturn = result.summary['5year'];
      results.push({
        size: config.size,
        threshold: config.threshold,
        return: fiveYearReturn
      });

      console.log(`    → 5yr return: ${fiveYearReturn ? fiveYearReturn.toFixed(2) + '%' : 'N/A'}`);
    } catch (error) {
      console.error(`    ✗ Error: ${error.message}`);
      results.push({
        size: config.size,
        threshold: config.threshold,
        return: null
      });
    }
  }

  // Calculate average return across all configs
  const validReturns = results.filter(r => r.return !== null).map(r => r.return);
  const avgReturn = validReturns.length > 0
    ? validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length
    : 0;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`AVERAGE 5-YEAR RETURN ACROSS ALL CONFIGS: ${avgReturn.toFixed(2)}%`);
  console.log(`Valid configs: ${validReturns.length}/${PORTFOLIO_CONFIGS.length}`);
  console.log('='.repeat(80));

  return {
    avgReturn,
    results,
    weights
  };
}

/**
 * Particle Swarm Optimization (PSO)
 * Intelligent search algorithm inspired by bird flocking behavior
 */
class ParticleSwarmOptimizer {
  constructor(options = {}) {
    this.numParticles = options.numParticles || 10;
    this.maxIterations = options.maxIterations || 20;
    this.w = options.inertia || 0.7; // Inertia weight
    this.c1 = options.cognitive || 1.5; // Cognitive (personal best) weight
    this.c2 = options.social || 1.5; // Social (global best) weight

    this.particles = [];
    this.globalBest = null;
    this.globalBestFitness = -Infinity;
  }

  /**
   * Initialize particles with random positions and velocities
   */
  initializeParticles() {
    console.log(`\nInitializing ${this.numParticles} particles...`);

    for (let i = 0; i < this.numParticles; i++) {
      // Random weights that sum to 100
      const weights = this.generateRandomWeights();

      this.particles.push({
        position: weights,
        velocity: {
          marketCap: (Math.random() - 0.5) * 20,
          adtv: (Math.random() - 0.5) * 20,
          priceToSales: (Math.random() - 0.5) * 20,
          salesGrowth: (Math.random() - 0.5) * 20,
          gfScore: (Math.random() - 0.5) * 20
        },
        personalBest: null,
        personalBestFitness: -Infinity
      });
    }
  }

  /**
   * Generate random weights that sum to 100
   */
  generateRandomWeights() {
    // Generate 5 random numbers
    const randoms = Array(5).fill(0).map(() => Math.random());
    const sum = randoms.reduce((a, b) => a + b, 0);

    // Normalize to sum to 100
    const normalized = randoms.map(r => Math.round((r / sum) * 100));

    // Adjust for rounding errors
    const currentSum = normalized.reduce((a, b) => a + b, 0);
    normalized[0] += (100 - currentSum);

    return {
      marketCap: Math.max(0, normalized[0]),
      adtv: Math.max(0, normalized[1]),
      priceToSales: Math.max(0, normalized[2]),
      salesGrowth: Math.max(0, normalized[3]),
      gfScore: Math.max(0, normalized[4])
    };
  }

  /**
   * Normalize weights to sum to 100
   */
  normalizeWeights(weights) {
    // Ensure all weights are non-negative
    const clamped = {
      marketCap: Math.max(0, weights.marketCap),
      adtv: Math.max(0, weights.adtv),
      priceToSales: Math.max(0, weights.priceToSales),
      salesGrowth: Math.max(0, weights.salesGrowth),
      gfScore: Math.max(0, weights.gfScore)
    };

    const sum = Object.values(clamped).reduce((a, b) => a + b, 0);

    if (sum === 0) {
      return this.generateRandomWeights();
    }

    // Normalize and round
    const normalized = {
      marketCap: Math.round((clamped.marketCap / sum) * 100),
      adtv: Math.round((clamped.adtv / sum) * 100),
      priceToSales: Math.round((clamped.priceToSales / sum) * 100),
      salesGrowth: Math.round((clamped.salesGrowth / sum) * 100),
      gfScore: Math.round((clamped.gfScore / sum) * 100)
    };

    // Fix rounding errors
    const currentSum = Object.values(normalized).reduce((a, b) => a + b, 0);
    normalized.marketCap += (100 - currentSum);

    return normalized;
  }

  /**
   * Update particle velocity and position
   */
  updateParticle(particle) {
    const keys = ['marketCap', 'adtv', 'priceToSales', 'salesGrowth', 'gfScore'];

    // Update velocity
    keys.forEach(key => {
      const r1 = Math.random();
      const r2 = Math.random();

      const cognitive = this.c1 * r1 * (particle.personalBest[key] - particle.position[key]);
      const social = this.c2 * r2 * (this.globalBest[key] - particle.position[key]);

      particle.velocity[key] = this.w * particle.velocity[key] + cognitive + social;

      // Limit velocity to prevent explosion
      particle.velocity[key] = Math.max(-50, Math.min(50, particle.velocity[key]));
    });

    // Update position
    const newPosition = {};
    keys.forEach(key => {
      newPosition[key] = particle.position[key] + particle.velocity[key];
    });

    // Normalize weights
    particle.position = this.normalizeWeights(newPosition);
  }

  /**
   * Run the optimization
   */
  async optimize() {
    console.log('\n' + '='.repeat(80));
    console.log('PARTICLE SWARM OPTIMIZATION');
    console.log('='.repeat(80));
    console.log(`Particles: ${this.numParticles}`);
    console.log(`Max Iterations: ${this.maxIterations}`);
    console.log(`Testing ${PORTFOLIO_CONFIGS.length} portfolio configurations per weight set`);
    console.log('='.repeat(80));

    this.initializeParticles();

    const history = [];

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      console.log(`\n${'#'.repeat(80)}`);
      console.log(`ITERATION ${iteration + 1}/${this.maxIterations}`);
      console.log('#'.repeat(80));

      // Evaluate all particles SEQUENTIALLY to avoid database conflicts
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];

        console.log(`\n--- Particle ${i + 1}/${this.numParticles} ---`);

        try {
          const result = await evaluateWeights(particle.position);
          const fitness = result.avgReturn;

          // Update personal best
          if (fitness > particle.personalBestFitness) {
            particle.personalBest = { ...particle.position };
            particle.personalBestFitness = fitness;
            console.log(`  ✓ New personal best: ${fitness.toFixed(2)}%`);
          }

          // Update global best
          if (fitness > this.globalBestFitness) {
            this.globalBest = { ...particle.position };
            this.globalBestFitness = fitness;
            console.log(`  ★ NEW GLOBAL BEST: ${fitness.toFixed(2)}%`);
          }
        } catch (error) {
          console.error(`  ✗ Error evaluating particle: ${error.message}`);
          // Keep the previous fitness value if evaluation fails
        }
      }

      // Record iteration results
      history.push({
        iteration: iteration + 1,
        globalBest: { ...this.globalBest },
        globalBestFitness: this.globalBestFitness
      });

      console.log(`\n${'='.repeat(80)}`);
      console.log(`END OF ITERATION ${iteration + 1}`);
      console.log(`Current Global Best: ${this.globalBestFitness.toFixed(2)}%`);
      console.log(`Weights: MC=${this.globalBest.marketCap}% ADTV=${this.globalBest.adtv}% P/S=${this.globalBest.priceToSales}% SG=${this.globalBest.salesGrowth}% GF=${this.globalBest.gfScore}%`);
      console.log('='.repeat(80));

      // Update particles for next iteration (except on last iteration)
      if (iteration < this.maxIterations - 1) {
        this.particles.forEach(p => this.updateParticle(p));
      }
    }

    return {
      best: this.globalBest,
      bestFitness: this.globalBestFitness,
      history
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('INTELLIGENT WEIGHT OPTIMIZATION');
  console.log('='.repeat(80));
  console.log('');
  console.log('Initializing database...');

  // Initialize database connection
  await initializeDatabase();
  console.log('Database initialized successfully.');
  console.log('');

  console.log('Optimization Metric:');
  console.log('  Average 5-year return across ALL portfolio configurations');
  console.log('');
  console.log('Portfolio Configurations:');
  console.log('  Sizes: 5, 10, 15, 20 stocks');
  console.log('  Keep Thresholds: 10, 20, 30 (drop to this rank before replacing)');
  console.log(`  Total: ${PORTFOLIO_CONFIGS.length} combinations`);
  console.log('');
  console.log('Optimization Algorithm:');
  console.log('  Particle Swarm Optimization (PSO)');
  console.log('  - Intelligent search inspired by swarm behavior');
  console.log('  - Balances exploration and exploitation');
  console.log('  - Much faster than brute force');
  console.log('='.repeat(80));

  const optimizer = new ParticleSwarmOptimizer({
    numParticles: 8,      // Number of different weight combinations to test in parallel
    maxIterations: 15,    // Number of optimization rounds
    inertia: 0.7,         // How much to keep current direction
    cognitive: 1.5,       // How much to trust personal best
    social: 1.5           // How much to trust global best
  });

  const result = await optimizer.optimize();

  console.log('\n\n');
  console.log('█'.repeat(80));
  console.log('OPTIMIZATION COMPLETE');
  console.log('█'.repeat(80));
  console.log('');
  console.log('BEST WEIGHTS FOUND:');
  console.log(`  Market Cap:      ${result.best.marketCap}%`);
  console.log(`  ADTV:            ${result.best.adtv}%`);
  console.log(`  Price/Sales:     ${result.best.priceToSales}%`);
  console.log(`  Sales Growth:    ${result.best.salesGrowth}%`);
  console.log(`  GF Score:        ${result.best.gfScore}%`);
  console.log('');
  console.log(`AVERAGE 5-YEAR RETURN: ${result.bestFitness.toFixed(2)}%`);
  console.log('  (Averaged across all 12 portfolio configurations)');
  console.log('');
  console.log('OPTIMIZATION HISTORY:');
  result.history.forEach(h => {
    console.log(`  Iteration ${h.iteration}: ${h.globalBestFitness.toFixed(2)}%`);
  });
  console.log('');
  console.log('█'.repeat(80));

  // Final comprehensive test
  console.log('\n\nFINAL VERIFICATION - Testing optimal weights across all configs:');
  const finalResult = await evaluateWeights(result.best);

  console.log('\nDetailed Results:');
  finalResult.results.forEach(r => {
    console.log(`  ${r.size} stocks, threshold ${r.threshold}: ${r.return ? r.return.toFixed(2) + '%' : 'N/A'}`);
  });
}

// Run the optimizer
main().catch(console.error);
