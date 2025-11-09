const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
let db;

/**
 * Initialize SQLite database
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      console.log('Connected to SQLite database');

      // Create tables
      db.run(`
        CREATE TABLE IF NOT EXISTS stocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT UNIQUE NOT NULL,
          name TEXT,
          marketCap REAL,
          adtv REAL,
          priceToSales REAL,
          salesGrowth REAL,
          price REAL,
          volume REAL,
          changePercent TEXT,
          marketCapRank INTEGER,
          adtvRank INTEGER,
          priceToSalesRank INTEGER,
          salesGrowthRank INTEGER,
          weightedScore REAL,
          overallRank INTEGER,
          additionalData TEXT,
          lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating stocks table:', err);
          reject(err);
          return;
        }

        // Create portfolio returns cache table
        db.run(`
          CREATE TABLE IF NOT EXISTS portfolio_returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topN INTEGER NOT NULL,
            returnsData TEXT NOT NULL,
            lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('Error creating portfolio_returns table:', err);
            reject(err);
            return;
          }

          // Create historical backtest cache table
          db.run(`
            CREATE TABLE IF NOT EXISTS historical_backtests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              yearsAgo INTEGER NOT NULL,
              topN INTEGER NOT NULL,
              weights TEXT NOT NULL,
              backtestData TEXT NOT NULL,
              lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(yearsAgo, topN, weights)
            )
          `, (err) => {
            if (err) {
              console.error('Error creating historical_backtests table:', err);
              reject(err);
              return;
            }

            // Create GF Scores cache table
            db.run(`
              CREATE TABLE IF NOT EXISTS gf_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT UNIQUE NOT NULL,
                gfScore INTEGER,
                gfValue REAL,
                currentPrice REAL,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) {
                console.error('Error creating gf_scores table:', err);
                reject(err);
                return;
              }

              // Create historical fundamentals table
              db.run(`
                CREATE TABLE IF NOT EXISTS historical_fundamentals (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  symbol TEXT NOT NULL,
                  yearsAgo INTEGER NOT NULL,
                  marketCap REAL,
                  adtv REAL,
                  priceToSales REAL,
                  salesGrowth REAL,
                  gfScore INTEGER,
                  date TEXT,
                  lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(symbol, yearsAgo)
                )
              `, (err) => {
                if (err) {
                  console.error('Error creating historical_fundamentals table:', err);
                  reject(err);
                  return;
                }

                // Create annual rebalance cache table
                db.run(`
                  CREATE TABLE IF NOT EXISTS annual_rebalance_returns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    weights TEXT NOT NULL,
                    returnsData TEXT NOT NULL,
                    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(weights)
                  )
                `, (err) => {
                  if (err) {
                    console.error('Error creating annual_rebalance_returns table:', err);
                    reject(err);
                    return;
                  }

                  console.log('Database tables initialized');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Save stocks to database
 */
function saveStocksToDB(stocks) {
  return new Promise((resolve, reject) => {
    // For each stock, preserve existing GARP metrics
    const stmt = db.prepare(`
      INSERT INTO stocks (
        symbol, name, marketCap, adtv, priceToSales, salesGrowth,
        price, volume, changePercent,
        marketCapRank, adtvRank, priceToSalesRank, salesGrowthRank,
        weightedScore, overallRank, additionalData, lastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(symbol) DO UPDATE SET
        name = excluded.name,
        marketCap = excluded.marketCap,
        adtv = excluded.adtv,
        priceToSales = excluded.priceToSales,
        salesGrowth = excluded.salesGrowth,
        price = excluded.price,
        volume = excluded.volume,
        changePercent = excluded.changePercent,
        marketCapRank = excluded.marketCapRank,
        adtvRank = excluded.adtvRank,
        priceToSalesRank = excluded.priceToSalesRank,
        salesGrowthRank = excluded.salesGrowthRank,
        weightedScore = excluded.weightedScore,
        overallRank = excluded.overallRank,
        additionalData = excluded.additionalData,
        lastUpdated = CURRENT_TIMESTAMP
    `);

    let completed = 0;
    let hasError = false;

    stocks.forEach(stock => {
      stmt.run(
        stock.symbol,
        stock.name,
        stock.marketCap,
        stock.adtv,
        stock.priceToSales,
        stock.salesGrowth,
        stock.price,
        stock.volume,
        stock.changePercent,
        stock.ranks?.marketCap,
        stock.ranks?.adtv,
        stock.ranks?.priceToSales,
        stock.ranks?.salesGrowth,
        stock.weightedScore,
        stock.overallRank,
        JSON.stringify(stock.additionalData),
        (err) => {
          if (err && !hasError) {
            hasError = true;
            reject(err);
            return;
          }

          completed++;
          if (completed === stocks.length && !hasError) {
            stmt.finalize(() => {
              console.log(`Saved ${stocks.length} stocks to database`);
              resolve();
            });
          }
        }
      );
    });
  });
}

/**
 * Get all stocks from database with GF Scores joined
 */
function getStocksFromDB() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT
        s.*,
        g.gfScore,
        g.gfValue,
        g.currentPrice as gfCurrentPrice
      FROM stocks s
      LEFT JOIN gf_scores g ON s.symbol = g.symbol
      ORDER BY s.overallRank ASC
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      const stocks = rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        marketCap: row.marketCap,
        adtv: row.adtv,
        priceToSales: row.priceToSales,
        salesGrowth: row.salesGrowth,
        gfScore: row.gfScore,  // From gf_scores table
        gfValue: row.gfValue,   // From gf_scores table
        price: row.price,
        volume: row.volume,
        changePercent: row.changePercent,
        ranks: {
          marketCap: row.marketCapRank,
          adtv: row.adtvRank,
          priceToSales: row.priceToSalesRank,
          salesGrowth: row.salesGrowthRank
        },
        weightedScore: row.weightedScore,
        overallRank: row.overallRank,
        additionalData: row.additionalData ? JSON.parse(row.additionalData) : {},
        lastUpdated: row.lastUpdated,
        // GARP metrics
        peRatio: row.peRatio,
        pegRatio: row.pegRatio,
        debtToEquity: row.debtToEquity,
        operatingMargin: row.operatingMargin,
        roic: row.roic,
        fcfYield: row.fcfYield,
        freeCashFlow: row.freeCashFlow,
        // Growth metrics
        fcfGrowth: row.fcfGrowth,
        epsGrowth: row.epsGrowth,
        revenueCagr: row.revenueCagr
      }));

      resolve(stocks);
    });
  });
}

/**
 * Get last update time
 */
function getLastUpdateTime() {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT MAX(lastUpdated) as lastUpdate FROM stocks
    `, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row?.lastUpdate || null);
    });
  });
}

/**
 * Clear all stocks from database
 */
function clearDatabase() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM stocks', (err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('Database cleared');
      resolve();
    });
  });
}

/**
 * Save portfolio returns to database
 */
function savePortfolioReturns(topN, returnsData) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO portfolio_returns (id, topN, returnsData, lastUpdated)
      VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    `, [topN, JSON.stringify(returnsData)], (err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`Saved portfolio returns for top ${topN} stocks`);
      resolve();
    });
  });
}

/**
 * Get cached portfolio returns from database
 */
function getPortfolioReturns(topN) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT returnsData, lastUpdated FROM portfolio_returns
      WHERE topN = ?
      ORDER BY lastUpdated DESC
      LIMIT 1
    `, [topN], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        resolve(null);
        return;
      }

      resolve({
        data: JSON.parse(row.returnsData),
        lastUpdated: row.lastUpdated
      });
    });
  });
}

/**
 * Get last update time for portfolio returns
 */
function getPortfolioReturnsUpdateTime(topN) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT MAX(lastUpdated) as lastUpdate FROM portfolio_returns
      WHERE topN = ?
    `, [topN], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row?.lastUpdate || null);
    });
  });
}

/**
 * Save historical backtest to database
 */
function saveHistoricalBacktest(yearsAgo, topN, weights, backtestData) {
  return new Promise((resolve, reject) => {
    const weightsKey = JSON.stringify(weights);
    db.run(`
      INSERT OR REPLACE INTO historical_backtests (yearsAgo, topN, weights, backtestData, lastUpdated)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [yearsAgo, topN, weightsKey, JSON.stringify(backtestData)], (err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`Saved historical backtest for ${yearsAgo}Y, top ${topN} stocks`);
      resolve();
    });
  });
}

/**
 * Get cached historical backtest from database
 */
function getHistoricalBacktest(yearsAgo, topN, weights) {
  return new Promise((resolve, reject) => {
    const weightsKey = JSON.stringify(weights);
    db.get(`
      SELECT backtestData, lastUpdated FROM historical_backtests
      WHERE years_ago = ? AND topN = ? AND weights = ?
      ORDER BY lastUpdated DESC
      LIMIT 1
    `, [yearsAgo, topN, weightsKey], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        resolve(null);
        return;
      }

      resolve({
        data: JSON.parse(row.backtestData),
        lastUpdated: row.lastUpdated
      });
    });
  });
}

/**
 * Get last update time for historical backtest
 */
function getHistoricalBacktestUpdateTime(yearsAgo, topN, weights) {
  return new Promise((resolve, reject) => {
    const weightsKey = JSON.stringify(weights);
    db.get(`
      SELECT MAX(lastUpdated) as lastUpdate FROM historical_backtests
      WHERE years_ago = ? AND topN = ? AND weights = ?
    `, [yearsAgo, topN, weightsKey], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row?.lastUpdate || null);
    });
  });
}

/**
 * Save a single GF Score to database
 */
function saveGFScore(score) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO gf_scores (symbol, gfScore, gfValue, currentPrice, lastUpdated)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [score.symbol, score.gfScore, score.gfValue, score.currentPrice], (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`Saved GF Score for ${score.symbol}`);
      resolve();
    });
  });
}

/**
 * Save GF Scores to database (batch)
 */
function saveGFScores(scores) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO gf_scores (symbol, gfScore, gfValue, currentPrice, lastUpdated)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let completed = 0;
    let hasError = false;

    scores.forEach(score => {
      stmt.run(
        score.symbol,
        score.gfScore,
        score.gfValue,
        score.currentPrice,
        (err) => {
          if (err && !hasError) {
            hasError = true;
            reject(err);
            return;
          }

          completed++;
          if (completed === scores.length && !hasError) {
            stmt.finalize(() => {
              console.log(`Saved ${scores.length} GF Scores to database`);
              resolve();
            });
          }
        }
      );
    });
  });
}

/**
 * Get all GF Scores from database
 */
function getGFScores() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM gf_scores`, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

/**
 * Get last update time for GF Scores
 */
function getGFScoresUpdateTime() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT MAX(lastUpdated) as lastUpdate FROM gf_scores`, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row?.lastUpdate || null);
    });
  });
}

/**
 * Save a single historical fundamental data point to database
 */
function saveHistoricalFundamental(data) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO historical_fundamentals
      (symbol, yearsAgo, marketCap, adtv, priceToSales, salesGrowth, gfScore, date, lastUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      data.symbol,
      data.yearsAgo,
      data.marketCap,
      data.adtv,
      data.priceToSales,
      data.salesGrowth,
      data.gfScore,
      data.date
    ], (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Get historical fundamental data for a specific stock and time
 */
function getHistoricalFundamental(symbol, yearsAgo) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT * FROM historical_fundamentals
      WHERE symbol = ? AND yearsAgo = ?
    `, [symbol, yearsAgo], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

/**
 * Get all historical fundamentals for a specific time period
 */
function getAllHistoricalFundamentals(yearsAgo) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM historical_fundamentals
      WHERE yearsAgo = ?
    `, [yearsAgo], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      // Map database columns (already in camelCase) to JavaScript properties
      const stocks = rows.map(row => ({
        symbol: row.symbol,
        marketCap: row.marketCap,
        adtv: row.adtv,
        priceToSales: row.priceToSales,
        salesGrowth: row.salesGrowth,
        gfScore: row.gfScore,
        date: row.date,
        // GARP metrics
        peRatio: row.peRatio,
        debtToEquity: row.debtToEquity,
        operatingMargin: row.operatingMargin,
        roic: row.roic,
        fcfYield: row.fcfYield,
        // Growth metrics
        fcfGrowth: row.fcfGrowth,
        epsGrowth: row.epsGrowth,
        revenueCagr: row.revenueCagr,
        pegRatio: row.pegRatio
      }));

      resolve(stocks);
    });
  });
}

/**
 * Check if we have historical data for a specific stock
 */
function hasHistoricalData(symbol, yearsAgo) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count FROM historical_fundamentals
      WHERE symbol = ? AND yearsAgo = ?
    `, [symbol, yearsAgo], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row.count > 0);
    });
  });
}

/**
 * Get count of stocks with historical data for a specific year
 */
function getHistoricalDataCount(yearsAgo) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(DISTINCT symbol) as count FROM historical_fundamentals
      WHERE years_ago = ?
    `, [yearsAgo], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row.count || 0);
    });
  });
}

/**
 * Save annual rebalance returns to database
 */
function saveAnnualRebalanceReturns(weights, returnsData, portfolioSize = 10) {
  return new Promise((resolve, reject) => {
    const cacheKey = JSON.stringify({ weights, portfolioSize });
    db.run(`
      INSERT OR REPLACE INTO annual_rebalance_returns (weights, returnsData, lastUpdated)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [cacheKey, JSON.stringify(returnsData)], (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`Saved annual rebalance returns for portfolio size ${portfolioSize}, weights: ${JSON.stringify(weights)}`);
      resolve();
    });
  });
}

/**
 * Get cached annual rebalance returns from database
 */
function getAnnualRebalanceReturns(weights, portfolioSize = 10) {
  return new Promise((resolve, reject) => {
    const cacheKey = JSON.stringify({ weights, portfolioSize });
    db.get(`
      SELECT returnsData, lastUpdated FROM annual_rebalance_returns
      WHERE weights = ?
    `, [cacheKey], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        data: JSON.parse(row.returnsData),
        lastUpdated: row.lastUpdated
      });
    });
  });
}

/**
 * Get last update time for annual rebalance returns
 */
function getAnnualRebalanceReturnsUpdateTime(weights, portfolioSize = 10) {
  return new Promise((resolve, reject) => {
    const cacheKey = JSON.stringify({ weights, portfolioSize });
    db.get(`
      SELECT lastUpdated FROM annual_rebalance_returns
      WHERE weights = ?
    `, [cacheKey], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row?.lastUpdated || null);
    });
  });
}

module.exports = {
  initializeDatabase,
  saveStocksToDB,
  getStocksFromDB,
  getLastUpdateTime,
  clearDatabase,
  savePortfolioReturns,
  getPortfolioReturns,
  getPortfolioReturnsUpdateTime,
  saveHistoricalBacktest,
  getHistoricalBacktest,
  getHistoricalBacktestUpdateTime,
  saveGFScore,
  saveGFScores,
  getGFScores,
  getGFScoresUpdateTime,
  saveHistoricalFundamental,
  getHistoricalFundamental,
  getAllHistoricalFundamentals,
  hasHistoricalData,
  getHistoricalDataCount,
  saveAnnualRebalanceReturns,
  getAnnualRebalanceReturns,
  getAnnualRebalanceReturnsUpdateTime
};
