/**
 * Stock Evaluation Service
 *
 * Evaluates stocks based on 5 metrics with weighted scoring:
 * - Market Cap (20% weight)
 * - ADTV - Average Daily Trading Volume (20% weight)
 * - P/S - Price-to-Sales ratio (20% weight)
 * - Sales Growth - 1-year net sales growth (20% weight)
 * - GF Score - GuruFocus Score (20% weight)
 */

class EvaluationService {
  constructor() {
    this.defaultWeights = {
      marketCap: 0.20,
      adtv: 0.20,
      priceToSales: 0.20,
      salesGrowth: 0.20,
      gfScore: 0.20
    };
    this.weights = this.defaultWeights;

    // Define duplicate company mappings
    this.duplicateCompanies = {
      'GOOGL': 'GOOG',  // GOOGL -> keep GOOG
      'GOOG': 'GOOG'    // GOOG -> keep GOOG
    };
  }

  /**
   * Merge duplicate companies (e.g., GOOG and GOOGL)
   * For ADTV, add them together
   * For other metrics, prefer the primary symbol's data
   */
  mergeDuplicates(stocks) {
    const merged = new Map();
    const duplicateGroups = new Map();

    // Group stocks by their canonical symbol
    stocks.forEach(stock => {
      const canonical = this.duplicateCompanies[stock.symbol] || stock.symbol;

      if (!duplicateGroups.has(canonical)) {
        duplicateGroups.set(canonical, []);
      }
      duplicateGroups.get(canonical).push(stock);
    });

    // Merge each group
    duplicateGroups.forEach((group, canonical) => {
      if (group.length === 1) {
        // No duplicates, keep as is
        merged.set(canonical, group[0]);
      } else {
        // Multiple stocks for same company - merge them
        // Sort to get the canonical symbol first
        const sorted = group.sort((a, b) => {
          if (a.symbol === canonical) return -1;
          if (b.symbol === canonical) return 1;
          return 0;
        });

        const primary = sorted[0];
        const mergedStock = { ...primary };

        // For ADTV, add them together
        const totalAdtv = group.reduce((sum, s) => sum + (s.adtv || 0), 0);
        mergedStock.adtv = totalAdtv;

        // Track which symbols were merged
        mergedStock.mergedFrom = group.map(s => s.symbol).filter(s => s !== canonical);

        merged.set(canonical, mergedStock);
      }
    });

    return Array.from(merged.values());
  }

  /**
   * Set custom weights for evaluation
   */
  setWeights(marketCap, adtv, priceToSales, salesGrowth, gfScore = 20, peRatio = 0, debtToEquity = 0, operatingMargin = 0, roic = 0, fcfYield = 0) {
    this.weights = {
      marketCap: marketCap / 100,
      adtv: adtv / 100,
      priceToSales: priceToSales / 100,
      salesGrowth: salesGrowth / 100,
      gfScore: gfScore / 100,
      peRatio: peRatio / 100,
      debtToEquity: debtToEquity / 100,
      operatingMargin: operatingMargin / 100,
      roic: roic / 100,
      fcfYield: fcfYield / 100
    };
  }

  /**
   * Reset to default weights
   */
  resetWeights() {
    this.weights = this.defaultWeights;
  }

  /**
   * Rank stocks by a metric (lower rank = better performance)
   * Handles ties: if 3 companies have same value, they all get same rank,
   * and next company gets rank+3 (not rank+1)
   */
  rankByMetric(stocks, metricKey, ascending = false) {
    // Filter out stocks with invalid metrics
    const validStocks = stocks.filter(stock => {
      const value = stock[metricKey];
      return value !== null && value !== undefined && !isNaN(value) && isFinite(value);
    });

    // Sort stocks by metric
    const sorted = [...validStocks].sort((a, b) => {
      const aValue = a[metricKey];
      const bValue = b[metricKey];
      return ascending ? aValue - bValue : bValue - aValue;
    });

    // Assign ranks with tie handling
    const ranksMap = new Map();
    let currentRank = 1;

    for (let i = 0; i < sorted.length; i++) {
      const currentValue = sorted[i][metricKey];

      // If this is the first stock or value differs from previous, assign new rank
      if (i === 0 || sorted[i - 1][metricKey] !== currentValue) {
        currentRank = i + 1;
      }

      ranksMap.set(sorted[i].symbol, currentRank);
    }

    // Assign worst rank to stocks with invalid metrics
    const worstRank = sorted.length + 1;
    stocks.forEach(stock => {
      if (!ranksMap.has(stock.symbol)) {
        ranksMap.set(stock.symbol, worstRank);
      }
    });

    return ranksMap;
  }

  /**
   * Calculate weighted score for each stock
   * Lower score = better overall ranking
   */
  calculateWeightedScores(stocks) {
    // Get ranks for each metric
    const marketCapRanks = this.rankByMetric(stocks, 'marketCap', false); // Higher is better
    const adtvRanks = this.rankByMetric(stocks, 'adtv', false); // Higher is better
    const psRanks = this.rankByMetric(stocks, 'priceToSales', true); // Lower is better
    const salesGrowthRanks = this.rankByMetric(stocks, 'salesGrowth', false); // Higher is better
    const gfScoreRanks = this.rankByMetric(stocks, 'gfScore', false); // Higher is better (100 = best)

    // GARP metrics ranks (always calculated for display, but only used in score if weight > 0)
    const peRatioRanks = this.rankByMetric(stocks, 'peRatio', true); // Lower is better
    const debtToEquityRanks = this.rankByMetric(stocks, 'debtToEquity', true); // Lower is better
    const operatingMarginRanks = this.rankByMetric(stocks, 'operatingMargin', false); // Higher is better
    const roicRanks = this.rankByMetric(stocks, 'roic', false); // Higher is better
    const fcfYieldRanks = this.rankByMetric(stocks, 'fcfYield', false); // Higher is better

    // Growth metrics ranks (always calculated for display, but only used in score if weight > 0)
    const fcfGrowthRanks = this.rankByMetric(stocks, 'fcfGrowth', false); // Higher is better
    const epsGrowthRanks = this.rankByMetric(stocks, 'epsGrowth', false); // Higher is better
    const revenueCagrRanks = this.rankByMetric(stocks, 'revenueCagr', false); // Higher is better
    const pegRatioRanks = this.rankByMetric(stocks, 'pegRatio', true); // Lower is better (PEG stored in DB)

    // Calculate weighted scores
    return stocks.map(stock => {
      const mcRank = marketCapRanks.get(stock.symbol);
      const adtvRank = adtvRanks.get(stock.symbol);
      const psRank = psRanks.get(stock.symbol);
      const sgRank = salesGrowthRanks.get(stock.symbol);
      const gfRank = gfScoreRanks.get(stock.symbol);

      const peRank = peRatioRanks.get(stock.symbol);
      const deRank = debtToEquityRanks.get(stock.symbol);
      const omRank = operatingMarginRanks.get(stock.symbol);
      const roicRank = roicRanks.get(stock.symbol);
      const fcfRank = fcfYieldRanks.get(stock.symbol);

      const fcfGrowthRank = fcfGrowthRanks.get(stock.symbol);
      const epsGrowthRank = epsGrowthRanks.get(stock.symbol);
      const revenueCagrRank = revenueCagrRanks.get(stock.symbol);
      const pegRank = pegRatioRanks.get(stock.symbol);

      // Calculate weighted score - only include GARP metrics if their weights > 0
      const weightedScore =
        (mcRank * this.weights.marketCap) +
        (adtvRank * this.weights.adtv) +
        (psRank * this.weights.priceToSales) +
        (sgRank * this.weights.salesGrowth) +
        (gfRank * this.weights.gfScore) +
        (peRank * this.weights.peRatio) +
        (deRank * this.weights.debtToEquity) +
        (omRank * this.weights.operatingMargin) +
        (roicRank * this.weights.roic) +
        (fcfRank * this.weights.fcfYield);

      return {
        ...stock,
        ranks: {
          marketCap: mcRank,
          adtv: adtvRank,
          priceToSales: psRank,
          salesGrowth: sgRank,
          gfScore: gfRank,
          peRatio: peRank,
          debtToEquity: deRank,
          operatingMargin: omRank,
          roic: roicRank,
          fcfYield: fcfRank,
          fcfGrowth: fcfGrowthRank,
          epsGrowth: epsGrowthRank,
          revenueCagr: revenueCagrRank,
          pegRatio: pegRank
        },
        weightedScore: weightedScore
      };
    });
  }

  /**
   * Evaluate and rank all stocks
   */
  evaluateStocks(stocks) {
    console.log(`[evaluateStocks] Input: ${stocks.length} stocks`);

    // Merge duplicate companies first
    const mergedStocks = this.mergeDuplicates(stocks);
    console.log(`[evaluateStocks] After mergeDuplicates: ${mergedStocks.length} stocks`);

    // Calculate weighted scores
    const scoredStocks = this.calculateWeightedScores(mergedStocks);
    console.log(`[evaluateStocks] After calculateWeightedScores: ${scoredStocks.length} stocks`);

    // Sort by weighted score (lower is better)
    const rankedStocks = scoredStocks.sort((a, b) => a.weightedScore - b.weightedScore);
    console.log(`[evaluateStocks] After sort: ${rankedStocks.length} stocks`);

    // Add overall rank
    const result = rankedStocks.map((stock, index) => ({
      ...stock,
      overallRank: index + 1
    }));
    console.log(`[evaluateStocks] Final output: ${result.length} stocks`);

    return result;
  }

  /**
   * Get top N stocks
   */
  getTopStocks(stocks, n = 10) {
    const evaluated = this.evaluateStocks(stocks);
    return evaluated.slice(0, n);
  }

  /**
   * Filter stocks by sector
   */
  filterBySector(stocks, sector) {
    return stocks.filter(stock =>
      stock.additionalData?.sector?.toLowerCase() === sector.toLowerCase()
    );
  }

  /**
   * Filter stocks by minimum market cap
   */
  filterByMinMarketCap(stocks, minMarketCap) {
    return stocks.filter(stock => stock.marketCap >= minMarketCap);
  }

  /**
   * Get statistics for a set of stocks
   */
  getStatistics(stocks) {
    if (stocks.length === 0) {
      return null;
    }

    const validMarketCaps = stocks.map(s => s.marketCap).filter(v => v && isFinite(v));
    const validADTVs = stocks.map(s => s.adtv).filter(v => v && isFinite(v));
    const validPS = stocks.map(s => s.priceToSales).filter(v => v && isFinite(v));
    const validGrowth = stocks.map(s => s.salesGrowth).filter(v => v && isFinite(v));

    // GARP metrics
    const validPE = stocks.map(s => s.peRatio).filter(v => v && isFinite(v));
    const validPEG = stocks.map(s => s.pegRatio).filter(v => v && isFinite(v));
    const validDE = stocks.map(s => s.debtToEquity).filter(v => v !== null && v !== undefined && isFinite(v));
    const validOpMargin = stocks.map(s => s.operatingMargin).filter(v => v && isFinite(v));
    const validROIC = stocks.map(s => s.roic).filter(v => v && isFinite(v));
    const validFCFYield = stocks.map(s => s.fcfYield).filter(v => v && isFinite(v));

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const median = arr => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      totalStocks: stocks.length,
      marketCap: {
        average: validMarketCaps.length ? avg(validMarketCaps) : 0,
        median: validMarketCaps.length ? median(validMarketCaps) : 0,
        max: validMarketCaps.length ? Math.max(...validMarketCaps) : 0,
        min: validMarketCaps.length ? Math.min(...validMarketCaps) : 0
      },
      adtv: {
        average: validADTVs.length ? avg(validADTVs) : 0,
        median: validADTVs.length ? median(validADTVs) : 0
      },
      priceToSales: {
        average: validPS.length ? avg(validPS) : 0,
        median: validPS.length ? median(validPS) : 0
      },
      salesGrowth: {
        average: validGrowth.length ? avg(validGrowth) : 0,
        median: validGrowth.length ? median(validGrowth) : 0,
        positive: validGrowth.filter(v => v > 0).length,
        negative: validGrowth.filter(v => v < 0).length
      },
      garp: {
        peRatio: {
          average: validPE.length ? avg(validPE) : 0,
          median: validPE.length ? median(validPE) : 0,
          coverage: (validPE.length / stocks.length * 100).toFixed(1) + '%'
        },
        pegRatio: {
          average: validPEG.length ? avg(validPEG) : 0,
          median: validPEG.length ? median(validPEG) : 0,
          coverage: (validPEG.length / stocks.length * 100).toFixed(1) + '%'
        },
        debtToEquity: {
          average: validDE.length ? avg(validDE) : 0,
          median: validDE.length ? median(validDE) : 0,
          coverage: (validDE.length / stocks.length * 100).toFixed(1) + '%'
        },
        operatingMargin: {
          average: validOpMargin.length ? avg(validOpMargin) : 0,
          median: validOpMargin.length ? median(validOpMargin) : 0,
          coverage: (validOpMargin.length / stocks.length * 100).toFixed(1) + '%'
        },
        roic: {
          average: validROIC.length ? avg(validROIC) : 0,
          median: validROIC.length ? median(validROIC) : 0,
          coverage: (validROIC.length / stocks.length * 100).toFixed(1) + '%'
        },
        fcfYield: {
          average: validFCFYield.length ? avg(validFCFYield) : 0,
          median: validFCFYield.length ? median(validFCFYield) : 0,
          coverage: (validFCFYield.length / stocks.length * 100).toFixed(1) + '%'
        }
      }
    };
  }
}

module.exports = new EvaluationService();
