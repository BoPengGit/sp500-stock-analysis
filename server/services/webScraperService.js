const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for 6 hours
const cache = new NodeCache({ stdTTL: 21600 });

/**
 * Web Scraper Service
 * Fetches stock data from publicly available sources
 */

class WebScraperService {
  constructor() {
    this.baseUrl = 'https://query1.finance.yahoo.com/v10/finance';
  }

  /**
   * Fetch stock quote from Yahoo Finance API
   */
  async getYahooQuote(symbol) {
    const cacheKey = `yahoo_quote_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const data = response.data.chart.result[0];
      const meta = data.meta;
      const quote = data.indicators.quote[0];

      const result = {
        symbol: meta.symbol,
        price: meta.regularMarketPrice,
        previousClose: meta.chartPreviousClose,
        change: meta.regularMarketPrice - meta.chartPreviousClose,
        changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
        volume: quote.volume[quote.volume.length - 1],
        marketCap: null // Will be fetched from summary
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching Yahoo quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch company summary data from Yahoo Finance
   */
  async getYahooSummary(symbol) {
    const cacheKey = `yahoo_summary_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const data = response.data.quoteSummary.result[0];
      const price = data.price;
      const summaryDetail = data.summaryDetail;
      const keyStats = data.defaultKeyStatistics;
      const financialData = data.financialData;

      const result = {
        symbol: price.symbol,
        name: price.longName || price.shortName,
        marketCap: price.marketCap?.raw || 0,
        sector: price.sector || 'Unknown',
        industry: price.industry || 'Unknown',
        beta: keyStats.beta?.raw || 1.0,
        averageVolume: summaryDetail.averageVolume?.raw || 0,
        priceToSales: keyStats.priceToSalesTrailing12Months?.raw || null,
        revenueGrowth: financialData.revenueGrowth?.raw || 0,
        dividendYield: summaryDetail.dividendYield?.raw || 0,
        trailingPE: summaryDetail.trailingPE?.raw || null
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching Yahoo summary for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive stock evaluation data
   */
  async getStockEvaluationData(symbol) {
    try {
      const [quote, summary] = await Promise.all([
        this.getYahooQuote(symbol).catch(() => null),
        this.getYahooSummary(symbol).catch(() => null)
      ]);

      if (!summary) {
        console.log(`Skipping ${symbol} - no summary data`);
        return null;
      }

      // Use quote data if available, otherwise use summary
      const price = quote?.price || summary.marketCap / 1000000000; // Estimate
      const volume = quote?.volume || summary.averageVolume;
      const changePercent = quote?.changePercent || 0;

      // Calculate sales growth percentage (convert from decimal)
      const salesGrowth = (summary.revenueGrowth || 0) * 100;

      return {
        symbol: symbol,
        name: summary.name,
        marketCap: summary.marketCap,
        adtv: summary.averageVolume,
        priceToSales: summary.priceToSales || 5.0, // Default if not available
        salesGrowth: salesGrowth,
        price: price,
        volume: volume,
        changePercent: changePercent,
        additionalData: {
          peRatio: summary.trailingPE,
          beta: summary.beta,
          dividendYield: summary.dividendYield,
          sector: summary.sector,
          industry: summary.industry
        }
      };
    } catch (error) {
      console.error(`Error getting evaluation data for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Batch fetch with rate limiting
   */
  async batchFetchStocks(symbols) {
    const results = [];
    const batchSize = 5; // Process 5 at a time to avoid rate limiting
    const delay = 1000; // 1 second delay between batches

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const batchPromises = batch.map(symbol =>
        this.getStockEvaluationData(symbol)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      console.log(`Processed ${Math.min(i + batchSize, symbols.length)}/${symbols.length} stocks`);

      // Wait before next batch (except for last batch)
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }
}

module.exports = new WebScraperService();
