const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

/**
 * Stock Data Service using Financial Modeling Prep (FMP) API
 *
 * FMP Free Tier: 250 API calls/day
 * Sign up: https://site.financialmodelingprep.com/developer/docs/
 *
 * To use real data:
 * 1. Get free API key from FMP
 * 2. Add FMP_API_KEY=your_key to .env file
 * 3. Set USE_MOCK_DATA=false in .env
 */

class StockDataService {
  constructor() {
    this.apiKey = process.env.FMP_API_KEY || 'demo';
    this.baseUrl = 'https://financialmodelingprep.com/api/v3';
    this.useMockData = process.env.USE_MOCK_DATA === 'true';
    console.log('StockDataService initialized:');
    console.log('- API Key:', this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('- Base URL:', this.baseUrl);
    console.log('- Use Mock Data:', this.useMockData);
  }

  /**
   * Fetch stock quote data using FMP API
   */
  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/quote/${symbol}?apikey=${this.apiKey}`;
      console.log(`Fetching quote URL: ${url.substring(0, 80)}...`);
      const response = await axios.get(url);
      const data = response.data[0];

      const result = {
        symbol: data.symbol,
        price: data.price,
        volume: data.volume,
        change: data.change,
        changePercent: data.changePercentage,
        avgVolume: data.volume // Use current volume as ADTV estimate
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch company profile using FMP API
   */
  async getCompanyProfile(symbol) {
    const cacheKey = `profile_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/profile/${symbol}?apikey=${this.apiKey}`;
      const response = await axios.get(url);
      const data = response.data[0];

      const result = {
        symbol: data.symbol,
        name: data.companyName,
        marketCap: data.mktCap,
        sector: data.sector,
        industry: data.industry,
        beta: data.beta,
        website: data.website,
        description: data.description
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching profile for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch key metrics including P/S ratio
   */
  async getKeyMetrics(symbol) {
    const cacheKey = `metrics_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/key-metrics-ttm/${symbol}?apikey=${this.apiKey}`;
      const response = await axios.get(url);
      const data = response.data[0];

      const result = {
        priceToSalesRatio: data.priceToSalesRatioTTM,
        peRatio: data.peRatioTTM,
        dividendYield: data.dividendYieldTTM,
        marketCap: data.marketCapTTM,
        revenuePerShare: data.revenuePerShareTTM
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching metrics for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch income statement for revenue growth
   */
  async getIncomeStatement(symbol) {
    const cacheKey = `income_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/income-statement/${symbol}?limit=5&apikey=${this.apiKey}`;
      const response = await axios.get(url);
      const data = response.data;

      if (data.length < 2) {
        return { salesGrowth: 0 };
      }

      // Calculate YoY revenue growth
      const currentRevenue = data[0].revenue;
      const previousRevenue = data[1].revenue;
      const salesGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;

      const result = {
        salesGrowth: salesGrowth,
        revenue: currentRevenue,
        previousRevenue: previousRevenue
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching income statement for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Add delay to respect API rate limits (paid tier)
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry API call with exponential backoff for 429 errors
   */
  async retryWithBackoff(fn, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.response?.status === 429 && i < retries - 1) {
          const waitTime = delay * Math.pow(2, i);
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${i + 1}/${retries}...`);
          await this.delay(waitTime);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Get comprehensive stock data for evaluation using FMP API
   * Uses paid tier endpoints: quote, profile, key-metrics, and income-statement
   * WITH RATE LIMITING: 300ms delay between each API call to avoid 429 errors
   * Paid tier allows 300 calls/minute = 5 calls/second = 200ms per call minimum
   */
  async getStockEvaluationData(symbol) {
    // Use mock data if configured
    if (this.useMockData) {
      return this.generateMockData(symbol);
    }

    try {
      // Fetch data SEQUENTIALLY with delays to respect rate limits
      const quote = await this.retryWithBackoff(() => this.getQuote(symbol)).catch(() => null);
      if (!this.useMockData) await this.delay(300); // 300ms delay

      const profile = await this.retryWithBackoff(() => this.getCompanyProfile(symbol)).catch(() => null);
      if (!this.useMockData) await this.delay(300); // 300ms delay

      const metrics = await this.retryWithBackoff(() => this.getKeyMetrics(symbol)).catch(() => null);
      if (!this.useMockData) await this.delay(300); // 300ms delay

      const income = await this.retryWithBackoff(() => this.getIncomeStatement(symbol)).catch(() => null);
      if (!this.useMockData) await this.delay(300); // 300ms delay

      if (!quote || !profile) {
        console.log(`Skipping ${symbol} - missing data`);
        return null;
      }

      // Use real metrics from paid API, with fallbacks
      const priceToSales = metrics?.priceToSalesRatio || 5.0; // Default fallback
      const salesGrowth = income?.salesGrowth || 0;

      return {
        symbol: symbol,
        name: profile.name,
        marketCap: profile.marketCap,
        adtv: quote.avgVolume,
        priceToSales: priceToSales,
        salesGrowth: salesGrowth,
        price: quote.price,
        volume: quote.volume,
        changePercent: quote.changePercent,
        additionalData: {
          peRatio: metrics?.peRatio || null,
          beta: profile.beta,
          dividendYield: metrics?.dividendYield || 0,
          sector: profile.sector,
          industry: profile.industry
        }
      };
    } catch (error) {
      console.error(`Error getting evaluation data for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate mock data for testing without API calls
   * Remove this in production when real API is configured
   */
  generateMockData(symbol) {
    const baseMarketCap = Math.random() * 2000000000000; // Up to 2T
    const baseVolume = Math.random() * 100000000; // Up to 100M shares
    const baseSales = baseMarketCap / (Math.random() * 10 + 1);
    const salesGrowth = (Math.random() - 0.3) * 100; // -30% to +70%

    return {
      symbol: symbol,
      name: `${symbol} Company Inc.`,
      marketCap: baseMarketCap,
      adtv: baseVolume,
      priceToSales: baseMarketCap / baseSales,
      salesGrowth: salesGrowth,
      price: Math.random() * 500 + 50,
      volume: baseVolume,
      changePercent: `${((Math.random() - 0.5) * 10).toFixed(2)}%`,
      additionalData: {
        peRatio: Math.random() * 50 + 5,
        beta: Math.random() * 2,
        dividendYield: Math.random() * 0.05,
        profitMargin: Math.random() * 0.3
      }
    };
  }

  /**
   * Fetch historical price data for a stock
   * Returns array of daily prices for the specified period
   *
   * NOTE: FMP free tier provides up to 5 years of historical data
   * For periods > 5 years, we supplement with mock data
   */
  async getHistoricalPrices(symbol, years = 10) {
    const cacheKey = `historical_${symbol}_${years}y`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (this.useMockData) {
      // Generate mock historical data
      const result = this.generateMockHistoricalData(symbol, years);
      cache.set(cacheKey, result);
      return result;
    }

    try {
      // FMP historical price endpoint - Starter tier gives us ~5 years max
      // Use 4.99 years to stay safely under the limit
      const fromDate = new Date();
      const yearsToFetch = Math.min(years, 4.99);
      const daysToFetch = Math.floor(yearsToFetch * 365);
      fromDate.setDate(fromDate.getDate() - daysToFetch);
      const fromStr = fromDate.toISOString().split('T')[0];

      const url = `${this.baseUrl}/historical-price-full/${symbol}?from=${fromStr}&apikey=${this.apiKey}`;
      const response = await axios.get(url);

      if (!response.data || !response.data.historical || response.data.historical.length === 0) {
        console.log(`No historical data for ${symbol}, using mock data`);
        const result = this.generateMockHistoricalData(symbol, years);
        cache.set(cacheKey, result);
        return result;
      }

      const historical = response.data.historical;

      // NEVER use mock data - only use real API data
      // If we need more years than API provides, just use what we have
      const result = {
        symbol: symbol,
        prices: historical.map(day => ({
          date: day.date,
          close: day.close,
          adjClose: day.adjClose || day.close
        }))
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching historical prices for ${symbol}:`, error.message);
      // Don't fall back to mock data - return null so we know data is missing
      return null;
    }
  }

  /**
   * Generate mock historical data for testing
   */
  generateMockHistoricalData(symbol, years) {
    const prices = [];
    const today = new Date();
    const startPrice = Math.random() * 200 + 50;
    const annualGrowth = (Math.random() - 0.3) * 0.5; // -30% to +20% annual growth

    for (let i = years * 365; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      // Calculate price with growth and some random noise
      const yearProgress = (years * 365 - i) / 365;
      const growthFactor = Math.pow(1 + annualGrowth, yearProgress);
      const noise = 1 + (Math.random() - 0.5) * 0.1; // ±5% daily noise
      const price = startPrice * growthFactor * noise;

      prices.push({
        date: date.toISOString().split('T')[0],
        close: price,
        adjClose: price
      });
    }

    return {
      symbol: symbol,
      prices: prices.reverse() // Most recent first
    };
  }

  /**
   * Get historical market cap for a specific date
   * Uses historical-market-capitalization endpoint
   */
  async getHistoricalMarketCap(symbol, targetDate) {
    const cacheKey = `hist_mc_${symbol}_${targetDate}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (this.useMockData) {
      // Generate mock historical market cap
      const currentMC = Math.random() * 2000000000000;
      const yearsAgo = (new Date() - new Date(targetDate)) / (365.25 * 24 * 60 * 60 * 1000);
      const growthFactor = Math.pow(1 + (Math.random() - 0.3) * 0.3, yearsAgo);
      const result = currentMC / growthFactor;
      cache.set(cacheKey, result);
      return result;
    }

    try {
      const fromDate = new Date(targetDate);
      fromDate.setMonth(fromDate.getMonth() - 1); // Get a month range
      const toDate = new Date(targetDate);
      toDate.setMonth(toDate.getMonth() + 1);

      const url = `${this.baseUrl}/historical-market-capitalization/${symbol}?from=${fromDate.toISOString().split('T')[0]}&to=${toDate.toISOString().split('T')[0]}&apikey=${this.apiKey}`;
      const response = await axios.get(url);

      if (!response.data || response.data.length === 0) {
        console.log(`No historical market cap for ${symbol} at ${targetDate}`);
        return null;
      }

      // Find closest date
      const target = new Date(targetDate);
      let closest = response.data[0];
      let closestDiff = Math.abs(target - new Date(response.data[0].date));

      for (const item of response.data) {
        const diff = Math.abs(target - new Date(item.date));
        if (diff < closestDiff) {
          closest = item;
          closestDiff = diff;
        }
      }

      const result = closest.marketCap;
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching historical market cap for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical key metrics (including P/S ratio) for a specific year
   * Uses key-metrics endpoint with annual period
   */
  async getHistoricalKeyMetrics(symbol, yearsAgo) {
    const cacheKey = `hist_metrics_${symbol}_${yearsAgo}y`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (this.useMockData) {
      // Generate mock historical P/S ratio
      const result = {
        priceToSalesRatio: Math.random() * 10 + 0.5,
        date: new Date(new Date().setFullYear(new Date().getFullYear() - yearsAgo)).toISOString().split('T')[0]
      };
      cache.set(cacheKey, result);
      return result;
    }

    try {
      const url = `${this.baseUrl}/key-metrics/${symbol}?period=annual&limit=10&apikey=${this.apiKey}`;
      const response = await axios.get(url);

      if (!response.data || response.data.length === 0) {
        console.log(`No historical key metrics for ${symbol}`);
        return null;
      }

      // Find the data point closest to N years ago
      const targetYear = new Date().getFullYear() - yearsAgo;
      const closest = response.data.find(item => {
        const itemYear = new Date(item.date).getFullYear();
        return itemYear === targetYear || itemYear === targetYear - 1;
      });

      if (!closest) {
        console.log(`No key metrics for ${symbol} ${yearsAgo} years ago`);
        return null;
      }

      const result = {
        priceToSalesRatio: closest.priceToSalesRatio,
        date: closest.date
      };
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching historical key metrics for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical income statements for calculating sales growth
   * Uses income-statement endpoint with annual period
   */
  async getHistoricalIncomeStatement(symbol, yearsAgo) {
    const cacheKey = `hist_income_${symbol}_${yearsAgo}y`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (this.useMockData) {
      // Generate mock historical revenue and growth
      const currentRevenue = Math.random() * 100000000000;
      const result = {
        revenue: currentRevenue / Math.pow(1.1, yearsAgo),
        salesGrowth: (Math.random() - 0.3) * 100,
        date: new Date(new Date().setFullYear(new Date().getFullYear() - yearsAgo)).toISOString().split('T')[0]
      };
      cache.set(cacheKey, result);
      return result;
    }

    try {
      const url = `${this.baseUrl}/income-statement/${symbol}?period=annual&limit=10&apikey=${this.apiKey}`;
      const response = await axios.get(url);

      if (!response.data || response.data.length < 2) {
        console.log(`No historical income statement for ${symbol}`);
        return null;
      }

      // Find the data point closest to N years ago
      const targetYear = new Date().getFullYear() - yearsAgo;
      const currentIndex = response.data.findIndex(item => {
        const itemYear = new Date(item.date).getFullYear();
        return itemYear === targetYear || itemYear === targetYear - 1;
      });

      if (currentIndex === -1 || currentIndex === response.data.length - 1) {
        console.log(`No income statement for ${symbol} ${yearsAgo} years ago`);
        return null;
      }

      const current = response.data[currentIndex];
      const previous = response.data[currentIndex + 1];

      const salesGrowth = ((current.revenue - previous.revenue) / previous.revenue) * 100;

      const result = {
        revenue: current.revenue,
        salesGrowth: salesGrowth,
        date: current.date
      };
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching historical income statement for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical ADTV (Average Daily Trading Volume)
   * Calculate from historical price data over a 3-month period
   */
  async getHistoricalADTV(symbol, targetDate) {
    const cacheKey = `hist_adtv_${symbol}_${targetDate}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (this.useMockData) {
      // Generate mock historical ADTV
      const result = Math.random() * 100000000;
      cache.set(cacheKey, result);
      return result;
    }

    try {
      // Get 3 months of data around the target date for ADTV calculation
      const fromDate = new Date(targetDate);
      fromDate.setMonth(fromDate.getMonth() - 3);
      const toDate = new Date(targetDate);

      const url = `${this.baseUrl}/historical-price-full/${symbol}?from=${fromDate.toISOString().split('T')[0]}&to=${toDate.toISOString().split('T')[0]}&apikey=${this.apiKey}`;
      const response = await axios.get(url);

      if (!response.data || !response.data.historical || response.data.historical.length === 0) {
        console.log(`No historical price data for ${symbol} at ${targetDate}`);
        return null;
      }

      // Calculate average volume
      const volumes = response.data.historical.map(day => day.volume).filter(v => v > 0);
      if (volumes.length === 0) {
        return null;
      }

      const result = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching historical ADTV for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical GF Score for a stock (delegates to GuruFocus service)
   */
  async getHistoricalGFScore(symbol, yearsAgo) {
    const guruFocusService = require('./guruFocusService');
    try {
      const gfData = await guruFocusService.getHistoricalStockRanking(symbol, yearsAgo);
      return gfData;
    } catch (error) {
      console.error(`Error getting historical GF Score for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get comprehensive historical fundamental data for a stock at a specific point in time
   * Now includes GF Score
   */
  async getHistoricalFundamentals(symbol, yearsAgo) {
    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    try {
      const [marketCap, metrics, income, adtv, gfScore] = await Promise.all([
        this.getHistoricalMarketCap(symbol, targetDateStr).catch(() => null),
        this.getHistoricalKeyMetrics(symbol, yearsAgo).catch(() => null),
        this.getHistoricalIncomeStatement(symbol, yearsAgo).catch(() => null),
        this.getHistoricalADTV(symbol, targetDateStr).catch(() => null),
        this.getHistoricalGFScore(symbol, yearsAgo).catch(() => null)
      ]);

      if (!marketCap && !metrics && !income && !adtv) {
        console.log(`No historical data for ${symbol} ${yearsAgo} years ago`);
        return null;
      }

      return {
        symbol: symbol,
        marketCap: marketCap,
        adtv: adtv,
        priceToSales: metrics?.priceToSalesRatio,
        salesGrowth: income?.salesGrowth,
        gfScore: gfScore?.gfScore,
        date: targetDateStr
      };
    } catch (error) {
      console.error(`Error getting historical fundamentals for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Batch fetch with rate limiting
   * FMP free tier: 250 calls/day, no per-minute limit
   */
  async batchFetchStocks(symbols) {
    const results = [];
    const batchSize = this.useMockData ? 50 : 10; // Process more at once with mock data
    const delay = this.useMockData ? 0 : 2000; // 2 second delay between batches for real API

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const batchPromises = batch.map(symbol =>
        this.getStockEvaluationData(symbol)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      console.log(`Processed ${Math.min(i + batchSize, symbols.length)}/${symbols.length} stocks`);

      // Wait before next batch (except for last batch)
      if (i + batchSize < symbols.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }
}

module.exports = new StockDataService();
