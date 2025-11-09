#!/usr/bin/env node

/**
 * Migration Script: Add 2-Year and 4-Year Returns to Cached Portfolio Data
 *
 * This script updates existing cached portfolio returns to include 2-year and 4-year data
 * WITHOUT recalculating the existing 1-year, 3-year, and 5-year returns.
 */

const { initializeDatabase } = require('./server/database/db');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const stockDataService = require('./server/services/stockDataService');

const DB_PATH = path.join(__dirname, 'data', 'stocks.db');

/**
 * Get price from historical data for a specific date
 */
function getPriceOnDate(historicalData, targetDate) {
  if (!historicalData || !historicalData.prices) {
    return null;
  }

  const target = new Date(targetDate);
  let closestPrice = null;
  let closestDate = null;
  let closestDiff = Infinity;

  for (const priceData of historicalData.prices) {
    const priceDate = new Date(priceData.date);
    const diff = target - priceDate;

    if (diff >= 0 && diff < closestDiff) {
      closestDiff = diff;
      closestPrice = priceData.adjClose;
      closestDate = priceData.date;
    }
  }

  return closestPrice !== null ? { price: closestPrice, date: closestDate } : null;
}

/**
 * Calculate return percentage
 */
function calculateReturn(startPrice, endPrice) {
  if (!startPrice || !endPrice || startPrice === 0) {
    return null;
  }
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Calculate annualized returns from total returns
 */
function calculateAnnualizedReturn(totalReturn, years) {
  if (!totalReturn || years <= 0) return null;
  const decimal = totalReturn / 100;
  const cagr = (Math.pow(1 + decimal, 1 / years) - 1) * 100;
  return cagr;
}

async function migratePortfolioReturns() {
  console.log('=== Migration: Add 2-Year and 4-Year Returns ===\n');

  await initializeDatabase();

  const db = new sqlite3.Database(DB_PATH);

  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM portfolio_returns', async (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      if (rows.length === 0) {
        console.log('No cached portfolio returns found. Nothing to migrate.');
        db.close();
        resolve();
        return;
      }

      console.log(`Found ${rows.length} cached portfolio returns to migrate.\n`);

      for (const row of rows) {
        try {
          console.log(`Migrating portfolio returns for top ${row.topN} stocks...`);

          const data = JSON.parse(row.returnsData);
          const symbols = data.stocks.map(s => s.symbol);

          console.log(`  Stocks: ${symbols.join(', ')}`);

          // Calculate dates for 2-year and 4-year periods
          const today = new Date();
          const twoYearsAgo = new Date(today);
          twoYearsAgo.setFullYear(today.getFullYear() - 2);

          const fourYearsAgo = new Date(today);
          fourYearsAgo.setFullYear(today.getFullYear() - 4);

          // Fetch historical data for each stock (only need ~4 years)
          const historicalDataPromises = symbols.map(symbol =>
            stockDataService.getHistoricalPrices(symbol, 4.99)
          );

          const historicalDataArray = await Promise.all(historicalDataPromises);

          // Update each stock's returns
          let portfolioTwoYearAnnualized = 0;
          let portfolioTwoYearTotal = 0;
          let portfolioFourYearAnnualized = 0;
          let portfolioFourYearTotal = 0;
          let validStocksTwoYear = 0;
          let validStocksFourYear = 0;

          for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const historicalData = historicalDataArray[i];
            const stockData = data.stocks.find(s => s.symbol === symbol);

            if (!historicalData || !stockData) {
              console.log(`  ⚠️  No historical data for ${symbol}, skipping...`);
              continue;
            }

            // Get current price (most recent)
            const currentPrice = historicalData.prices[0]?.adjClose;
            const currentDate = historicalData.prices[0]?.date;

            // Get historical prices for 2-year and 4-year
            const priceData2Year = getPriceOnDate(historicalData, twoYearsAgo);
            const priceData4Year = getPriceOnDate(historicalData, fourYearsAgo);

            // Calculate total returns
            const twoYearTotalReturn = priceData2Year ? calculateReturn(priceData2Year.price, currentPrice) : null;
            const fourYearTotalReturn = priceData4Year ? calculateReturn(priceData4Year.price, currentPrice) : null;

            // Calculate actual time periods for annualization
            const actualTwoYearPeriod = priceData2Year && currentDate
              ? (new Date(currentDate) - new Date(priceData2Year.date)) / (365.25 * 24 * 60 * 60 * 1000)
              : 2;
            const actualFourYearPeriod = priceData4Year && currentDate
              ? (new Date(currentDate) - new Date(priceData4Year.date)) / (365.25 * 24 * 60 * 60 * 1000)
              : 4;

            // Calculate annualized returns
            const twoYearAnnualized = twoYearTotalReturn !== null
              ? calculateAnnualizedReturn(twoYearTotalReturn, actualTwoYearPeriod)
              : null;
            const fourYearAnnualized = fourYearTotalReturn !== null
              ? calculateAnnualizedReturn(fourYearTotalReturn, actualFourYearPeriod)
              : null;

            // Update stock data with new fields
            stockData.returns.twoYear = twoYearAnnualized;
            stockData.returns.twoYearTotal = twoYearTotalReturn;
            stockData.returns.fourYear = fourYearAnnualized;
            stockData.returns.fourYearTotal = fourYearTotalReturn;

            // Accumulate portfolio-level returns
            if (twoYearAnnualized !== null) {
              portfolioTwoYearAnnualized += twoYearAnnualized * (stockData.weight / 100);
              portfolioTwoYearTotal += twoYearTotalReturn * (stockData.weight / 100);
              validStocksTwoYear++;
            }
            if (fourYearAnnualized !== null) {
              portfolioFourYearAnnualized += fourYearAnnualized * (stockData.weight / 100);
              portfolioFourYearTotal += fourYearTotalReturn * (stockData.weight / 100);
              validStocksFourYear++;
            }
          }

          // Update portfolio-level returns
          data.portfolio.twoYear = portfolioTwoYearAnnualized;
          data.portfolio.twoYearTotal = portfolioTwoYearTotal;
          data.portfolio.fourYear = portfolioFourYearAnnualized;
          data.portfolio.fourYearTotal = portfolioFourYearTotal;

          // Update validStocks counts
          if (!data.portfolio.validStocks) {
            data.portfolio.validStocks = {};
          }
          data.portfolio.validStocks.twoYear = validStocksTwoYear;
          data.portfolio.validStocks.fourYear = validStocksFourYear;

          // Update metadata periods
          if (data.metadata && data.metadata.periods) {
            data.metadata.periods.twoYear = twoYearsAgo.toISOString().split('T')[0];
            data.metadata.periods.fourYear = fourYearsAgo.toISOString().split('T')[0];
          }

          // Save updated data back to database
          const updatedData = JSON.stringify(data);

          await new Promise((resolveUpdate, rejectUpdate) => {
            db.run(
              'UPDATE portfolio_returns SET returnsData = ?, lastUpdated = ? WHERE id = ?',
              [updatedData, new Date().toISOString(), row.id],
              (updateErr) => {
                if (updateErr) {
                  rejectUpdate(updateErr);
                } else {
                  resolveUpdate();
                }
              }
            );
          });

          console.log(`  ✅ Updated portfolio returns for top ${row.topN}`);
          console.log(`     2-Year Annualized: ${portfolioTwoYearAnnualized.toFixed(2)}% (${validStocksTwoYear} stocks)`);
          console.log(`     4-Year Annualized: ${portfolioFourYearAnnualized.toFixed(2)}% (${validStocksFourYear} stocks)\n`);

        } catch (error) {
          console.error(`  ❌ Error migrating row ${row.id}:`, error.message);
        }
      }

      db.close();
      console.log('Migration complete!');
      resolve();
    });
  });
}

(async () => {
  try {
    await migratePortfolioReturns();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();
