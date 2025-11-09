const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/**
 * Historical Data Service
 *
 * Fetches historical stock data from 1 year ago using FMP API
 * - Market Cap (from historical market cap endpoint)
 * - ADTV (calculated from historical price data)
 * - P/S Ratio (from historical ratios)
 * - Sales Growth (from historical financial statements)
 */

const axios = require('axios');
const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * Get date from 1 year ago in YYYY-MM-DD format
 */
function getOneYearAgoDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Fetch historical market cap from 1 year ago
 * Uses historical market cap endpoint (available in all plans)
 */
async function fetchHistoricalMarketCap(symbol) {
  try {
    const oneYearAgo = getOneYearAgoDate();

    // Use historical market cap endpoint - returns data directly
    const url = `${BASE_URL}/historical-market-capitalization/${symbol}?from=${getDateOffset(oneYearAgo, -5)}&to=${getDateOffset(oneYearAgo, 5)}&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.length > 0) {
      // Find the market cap closest to 1 year ago
      const targetDate = new Date(oneYearAgo);
      let closest = response.data[0];
      let minDiff = Math.abs(new Date(closest.date) - targetDate);

      for (const entry of response.data) {
        const diff = Math.abs(new Date(entry.date) - targetDate);
        if (diff < minDiff) {
          minDiff = diff;
          closest = entry;
        }
      }

      return closest.marketCap;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching historical market cap for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch historical ADTV (Average Daily Trading Volume) from 1 year ago
 * Calculate from 20-day average around the 1-year-ago date
 */
async function fetchHistoricalADTV(symbol) {
  try {
    const oneYearAgo = getOneYearAgoDate();

    // Fetch historical price data from 1 year ago
    const url = `${BASE_URL}/historical-price-full/${symbol}?from=${getDateOffset(oneYearAgo, -20)}&to=${getDateOffset(oneYearAgo, 5)}&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.historical && response.data.historical.length > 0) {
      const volumes = response.data.historical.map(day => day.volume).filter(v => v > 0);

      if (volumes.length > 0) {
        // Calculate 20-day average
        const sum = volumes.reduce((a, b) => a + b, 0);
        return sum / volumes.length;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching historical ADTV for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Helper to add/subtract days from a date
 */
function getDateOffset(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Fetch historical P/S ratio from 1 year ago
 * Uses quarterly ratios (available in all plans)
 */
async function fetchHistoricalPriceToSales(symbol) {
  try {
    // Use quarterly ratios endpoint (available in all plans)
    // Data is sorted newest first, so we need to get the LAST item (oldest)
    const url = `${BASE_URL}/ratios/${symbol}?period=quarter&limit=8&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.length >= 4) {
      // Get the ratio from ~1 year ago (last item in array, which is oldest)
      const oneYearAgoRatio = response.data[response.data.length - 1];
      return oneYearAgoRatio.priceToSalesRatio || oneYearAgoRatio.priceSalesRatio || null;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching historical P/S for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch historical sales growth from 1 year ago
 * Uses quarterly financial growth data (available in all plans)
 */
async function fetchHistoricalSalesGrowth(symbol) {
  try {
    // Use quarterly financial growth endpoint (available in all plans)
    // Data is sorted newest first, so we need to get the LAST item (oldest)
    const url = `${BASE_URL}/financial-growth/${symbol}?period=quarter&limit=8&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.length >= 4) {
      // Get growth metrics from ~1 year ago (last item in array, which is oldest)
      const oneYearAgoGrowth = response.data[response.data.length - 1];

      if (oneYearAgoGrowth.revenueGrowth !== undefined && oneYearAgoGrowth.revenueGrowth !== null) {
        return oneYearAgoGrowth.revenueGrowth * 100; // Convert to percentage
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching historical sales growth for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch all historical data for a stock (1 year ago)
 */
async function fetchHistoricalStockData(symbol) {
  try {
    console.log(`Fetching 1-year-ago data for ${symbol}...`);

    // Fetch all metrics in parallel
    const [marketCap, adtv, priceToSales, salesGrowth] = await Promise.all([
      fetchHistoricalMarketCap(symbol),
      fetchHistoricalADTV(symbol),
      fetchHistoricalPriceToSales(symbol),
      fetchHistoricalSalesGrowth(symbol)
    ]);

    return {
      symbol,
      marketCap_1y_ago: marketCap,
      adtv_1y_ago: adtv,
      priceToSales_1y_ago: priceToSales,
      salesGrowth_1y_ago: salesGrowth
    };
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error.message);
    return {
      symbol,
      marketCap_1y_ago: null,
      adtv_1y_ago: null,
      priceToSales_1y_ago: null,
      salesGrowth_1y_ago: null
    };
  }
}

/**
 * Batch fetch historical data for multiple stocks with rate limiting
 */
async function batchFetchHistoricalData(symbols, delayMs = 200) {
  const results = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const data = await fetchHistoricalStockData(symbol);
    results.push(data);

    // Progress update every 10 stocks
    if ((i + 1) % 10 === 0) {
      console.log(`Progress: ${i + 1}/${symbols.length} stocks processed`);
    }

    // Rate limiting delay
    if (i < symbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

module.exports = {
  fetchHistoricalStockData,
  batchFetchHistoricalData,
  fetchHistoricalMarketCap,
  fetchHistoricalADTV,
  fetchHistoricalPriceToSales,
  fetchHistoricalSalesGrowth
};
