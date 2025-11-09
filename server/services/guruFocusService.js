/**
 * GuruFocus Service
 *
 * Web scrapes GF Value scores and other ranking data from GuruFocus website
 * Uses Puppeteer to bypass 403 restrictions
 *
 * GF Value: GuruFocus' proprietary fair value estimate
 * - Based on historical multiples, future estimates, and performance adjustments
 * - Displayed as a dollar amount on the summary page
 */

const puppeteer = require('puppeteer');
const { saveGFScore } = require('../database/db');

class GuruFocusService {
  constructor() {
    this.baseUrl = 'https://www.gurufocus.com/stock';
    this.useMockData = process.env.USE_MOCK_GURUFOCUS_DATA === 'true';
    this.browser = null;

    if (this.useMockData) {
      console.log('GuruFocus: Using mock data');
    } else {
      console.log('GuruFocus: Using web scraping with Puppeteer');
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('GuruFocus: Browser initialized');
    }
    return this.browser;
  }

  /**
   * Close Puppeteer browser
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('GuruFocus: Browser closed');
    }
  }

  /**
   * Scrape GF Value and ranking data for a single stock
   * URL pattern: https://www.gurufocus.com/stock/{ticker}/summary
   */
  async getStockRanking(symbol) {
    if (this.useMockData) {
      return this.getMockStockRanking(symbol);
    }

    let page = null;
    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const url = `${this.baseUrl}/${symbol}/summary`;
      console.log(`Scraping GuruFocus for ${symbol}...`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract GF Score and other data from the page
      const data = await page.evaluate(() => {
        const result = {
          gfScore: null,
          gfValue: null,
          currentPrice: null
        };

        try {
          // Search for "GF Score:" text and extract the number
          const allText = document.body.innerText;

          // Pattern: "GF Score: 99 /100" or "GF Score: 99/100"
          const gfScoreMatch = allText.match(/GF Score:\s*(\d+)\s*\/\s*100/i);
          if (gfScoreMatch) {
            result.gfScore = parseInt(gfScoreMatch[1]);
          }

          // Try alternate pattern: just "99 /100" or "99/100" near "GF Score"
          if (!result.gfScore) {
            const lines = allText.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes('GF Score')) {
                // Check current line and next few lines
                for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                  const scoreMatch = lines[j].match(/(\d+)\s*\/\s*100/);
                  if (scoreMatch) {
                    result.gfScore = parseInt(scoreMatch[1]);
                    break;
                  }
                }
                if (result.gfScore) break;
              }
            }
          }

          // Get GF Value (the dollar amount)
          const gfValueMatch = allText.match(/GF Value:\s*\$?([\d,]+\.?\d*)/i);
          if (gfValueMatch) {
            result.gfValue = parseFloat(gfValueMatch[1].replace(/,/g, ''));
          }

          // Get current price
          const priceElements = document.querySelectorAll('.bold.t-body-lg');
          if (priceElements.length > 0) {
            const priceText = priceElements[0].textContent;
            const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
            if (priceMatch) {
              result.currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
          }
        } catch (error) {
          console.error('Error extracting data:', error);
        }

        return result;
      });

      await page.close();

      return {
        symbol: symbol,
        gfScore: data.gfScore,
        gfValue: data.gfValue,
        currentPrice: data.currentPrice,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error scraping GuruFocus data for ${symbol}:`, error.message);
      if (page) await page.close();
      return null;
    }
  }

  /**
   * Batch fetch GF Value data for multiple stocks
   * Saves each stock incrementally to database with error recovery
   */
  async batchFetchStockRankings(symbols, delayMs = 3000) {
    let successCount = 0;
    let failCount = 0;
    const failedSymbols = [];

    console.log(`GuruFocus: Starting batch fetch for ${symbols.length} stocks...`);
    console.log(`GuruFocus: Saving incrementally to database after each scrape`);

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];

      try {
        console.log(`[${i + 1}/${symbols.length}] Scraping ${symbol}...`);
        const ranking = await this.getStockRanking(symbol);

        if (ranking && ranking.gfScore !== null) {
          // Save immediately to database
          await saveGFScore(ranking);
          successCount++;
          console.log(`✓ ${symbol}: GF Score = ${ranking.gfScore}`);
        } else {
          failCount++;
          failedSymbols.push(symbol);
          console.log(`✗ ${symbol}: No GF Score found`);
        }
      } catch (error) {
        failCount++;
        failedSymbols.push(symbol);
        console.error(`✗ ${symbol}: Error - ${error.message}`);

        // If browser crashed, try to reinitialize it
        if (error.message.includes('Connection closed') || error.message.includes('Target closed')) {
          console.log('Browser crashed, reinitializing...');
          await this.closeBrowser();
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Log progress every 10 stocks
      if ((i + 1) % 10 === 0) {
        console.log(`\nProgress: ${i + 1}/${symbols.length} | Success: ${successCount} | Failed: ${failCount}\n`);
      }

      // Rate limiting - wait between requests to avoid being blocked
      if (i < symbols.length - 1 && !this.useMockData) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Close browser after batch is complete
    await this.closeBrowser();

    console.log(`\n=== GuruFocus Scraping Complete ===`);
    console.log(`Total: ${symbols.length} | Success: ${successCount} | Failed: ${failCount}`);
    if (failedSymbols.length > 0) {
      console.log(`Failed symbols: ${failedSymbols.join(', ')}`);
    }

    return { successCount, failCount, failedSymbols };
  }

  /**
   * Scrape historical GF Score data for a single stock at a specific point in time
   * Uses GuruFocus year selector dropdown to get historical scores
   *
   * Process:
   * 1. Navigate to stock summary page
   * 2. Click the year dropdown in the GF Score section
   * 3. Select the target year
   * 4. Click the play button to load data
   * 5. Extract the GF Score value
   */
  async getHistoricalStockRanking(symbol, yearsAgo) {
    if (this.useMockData) {
      return this.getMockHistoricalStockRanking(symbol, yearsAgo);
    }

    let page = null;
    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Calculate target year
      const targetDate = new Date();
      targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);
      const targetYear = targetDate.getFullYear();
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Navigate to summary page
      const url = `${this.baseUrl}/${symbol}/summary`;
      console.log(`Scraping historical GF Score for ${symbol} for year ${targetYear}...`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to interact with the year selector dropdown
      try {
        // Find and click the year selector dropdown in the GF Score section
        const yearSelectorClicked = await page.evaluate((year) => {
          // Look for the year selector within the GF Score section
          const gfScoreSection = document.querySelector('#gf-score-section-US04EJ, [id*="gf-score-section"]');
          if (!gfScoreSection) return false;

          // Find the year selector dropdown
          const yearSelector = gfScoreSection.querySelector('.year-selector input');
          if (!yearSelector) return false;

          // Click to open dropdown
          yearSelector.click();
          return true;
        }, targetYear);

        if (yearSelectorClicked) {
          // Wait for dropdown to open
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Select the target year from dropdown
          const yearSelected = await page.evaluate((year) => {
            const yearOptions = Array.from(document.querySelectorAll('.el-select-dropdown__item'));
            const targetOption = yearOptions.find(opt => opt.textContent.trim() === String(year));
            if (targetOption) {
              targetOption.click();
              return true;
            }
            return false;
          }, targetYear);

          if (yearSelected) {
            // Wait for year selection to register
            await new Promise(resolve => setTimeout(resolve, 500));

            // Click the play button to load data for that year
            await page.evaluate(() => {
              const playButton = document.querySelector('.play-icon');
              if (playButton) {
                playButton.click();
              }
            });

            // Wait for data to load
            await new Promise(resolve => setTimeout(resolve, 3000));

            console.log(`Successfully selected year ${targetYear} for ${symbol}`);
          } else {
            console.log(`Could not find year ${targetYear} in dropdown for ${symbol}`);
          }
        } else {
          console.log(`Could not find year selector for ${symbol}`);
        }
      } catch (interactionError) {
        console.log(`Error interacting with year selector for ${symbol}:`, interactionError.message);
      }

      // Extract GF Score from the page
      const data = await page.evaluate(() => {
        const result = {
          gfScore: null,
          gfValue: null,
          currentPrice: null
        };

        try {
          // Look for GF Score in the page
          // Pattern 1: <span class="t-primary">99</span> within GF Score section
          const gfScoreSection = document.querySelector('#gf-score-section-US04EJ, [id*="gf-score-section"]');
          if (gfScoreSection) {
            const scoreElement = gfScoreSection.querySelector('.t-primary');
            if (scoreElement) {
              const scoreText = scoreElement.textContent.trim();
              const score = parseInt(scoreText);
              if (!isNaN(score)) {
                result.gfScore = score;
              }
            }
          }

          // Pattern 2: Search for "GF Score:" text
          if (!result.gfScore) {
            const allText = document.body.innerText;
            const gfScoreMatch = allText.match(/GF Score:\s*(\d+)\s*\/\s*100/i);
            if (gfScoreMatch) {
              result.gfScore = parseInt(gfScoreMatch[1]);
            }
          }

          // Get GF Value (the dollar amount)
          const gfValueMatch = document.body.innerText.match(/GF Value:\s*\$?([\d,]+\.?\d*)/i);
          if (gfValueMatch) {
            result.gfValue = parseFloat(gfValueMatch[1].replace(/,/g, ''));
          }

          // Get current price
          const priceElements = document.querySelectorAll('.bold.t-body-lg');
          if (priceElements.length > 0) {
            const priceText = priceElements[0].textContent;
            const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
            if (priceMatch) {
              result.currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
          }
        } catch (error) {
          console.error('Error extracting data:', error);
        }

        return result;
      });

      await page.close();

      if (data.gfScore !== null) {
        console.log(`✓ ${symbol}: GF Score = ${data.gfScore} for year ${targetYear}`);
        return {
          symbol: symbol,
          gfScore: data.gfScore,
          gfValue: data.gfValue,
          currentPrice: data.currentPrice,
          date: targetDateStr,
          lastUpdated: new Date().toISOString()
        };
      } else {
        console.log(`No historical GF Score found for ${symbol} for year ${targetYear}`);
        return null;
      }
    } catch (error) {
      console.error(`Error scraping historical GuruFocus data for ${symbol}:`, error.message);
      if (page) await page.close();
      return null;
    }
  }

  /**
   * Generate mock GF Score data for testing
   */
  getMockStockRanking(symbol) {
    // Generate consistent but pseudo-random values based on symbol
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seed = hash % 100;

    return {
      symbol: symbol,
      gfScore: Math.min(100, 50 + (seed % 51)), // 50-100
      gfValue: Math.round((50 + (seed % 200)) * 100) / 100, // $50-$250
      currentPrice: Math.round((40 + (seed % 180)) * 100) / 100, // $40-$220
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get ALL historical GF Scores for a stock (all years at once)
   * Much faster than individual year scraping since the data is already loaded in the page
   */
  async getAllHistoricalStockRankings(symbol) {
    if (this.useMockData) {
      // Return mock data for all 5 years
      return [1, 2, 3, 4, 5].map(yearsAgo => this.getMockHistoricalStockRanking(symbol, yearsAgo));
    }

    let page = null;
    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const url = `${this.baseUrl}/${symbol}/summary`;
      console.log(`Scraping ALL historical GF Scores for ${symbol}...`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract ALL historical GF Scores by clicking through years
      const allScores = [];
      const currentYear = new Date().getFullYear();

      // Get the current (default) year score first
      let currentData = await page.evaluate(() => {
        const gfScoreSection = document.querySelector('[id*="gf-score-section"]');
        if (!gfScoreSection) return null;

        const scoreElement = gfScoreSection.querySelector('.t-primary');
        const score = scoreElement ? parseInt(scoreElement.textContent.trim()) : null;

        // Find selected year
        const yearSelector = document.querySelector('.year-selector .el-input__inner');
        const selectedYear = yearSelector ? parseInt(yearSelector.value || yearSelector.getAttribute('value') || currentYear) : currentYear;

        return { year: selectedYear || currentYear, score };
      });

      if (currentData && currentData.score !== null) {
        allScores.push(currentData);
      }

      // Get list of available years
      const availableYears = await page.evaluate(() => {
        // Click the year dropdown to expand it
        const yearDropdown = document.querySelector('.year-selector .el-input__inner');
        if (yearDropdown) {
          yearDropdown.click();
        }

        // Wait a moment for dropdown to open
        return new Promise(resolve => {
          setTimeout(() => {
            const yearOptions = Array.from(document.querySelectorAll('.el-select-dropdown__item span'));
            const years = yearOptions.map(opt => parseInt(opt.textContent.trim())).filter(y => !isNaN(y) && y >= 2000);
            resolve(years);
          }, 500);
        });
      });

      console.log(`Found ${availableYears.length} years for ${symbol}:`, availableYears);

      // Click through each year and extract the GF Score
      for (const year of availableYears) {
        // Skip if we already have this year
        if (allScores.find(s => s.year === year)) {
          continue;
        }

        try {
          // Click the year and wait for update
          const scoreData = await page.evaluate((targetYear) => {
            return new Promise((resolve) => {
              // Find the year option
              const yearOptions = document.querySelectorAll('.el-select-dropdown__item span');
              const yearOption = Array.from(yearOptions).find(opt => parseInt(opt.textContent.trim()) === targetYear);

              if (!yearOption || !yearOption.parentElement) {
                resolve(null);
                return;
              }

              // Click the year
              yearOption.parentElement.click();

              // Wait for the GF Score to update
              setTimeout(() => {
                const gfScoreSection = document.querySelector('[id*="gf-score-section"]');
                if (!gfScoreSection) {
                  resolve(null);
                  return;
                }

                const scoreElement = gfScoreSection.querySelector('.t-primary');
                const score = scoreElement ? parseInt(scoreElement.textContent.trim()) : null;

                resolve({ year: targetYear, score });
              }, 1000); // Wait 1 second for the page to update
            });
          }, year);

          if (scoreData && scoreData.score !== null) {
            allScores.push(scoreData);
            console.log(`${symbol} ${year}: GF Score = ${scoreData.score}`);
          }

          // Small delay between clicks
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error extracting ${year} score:`, error.message);
        }
      }

      await page.close();

      console.log(`Extracted ${allScores.length} historical GF Scores for ${symbol}`);

      // Convert to the format expected by the caller
      // Convert year to yearsAgo
      const results = allScores.map(item => {
        const yearsAgo = currentYear - item.year;
        return {
          symbol: symbol,
          gfScore: item.score,
          year: item.year,
          yearsAgo: yearsAgo,
          date: `${item.year}-12-31` // Approximate end of year date
        };
      });

      return results;
    } catch (error) {
      console.error(`Error scraping historical GuruFocus data for ${symbol}:`, error.message);
      if (page) await page.close();
      return [];
    }
  }

  /**
   * Generate mock historical GF Score data for testing
   */
  getMockHistoricalStockRanking(symbol, yearsAgo) {
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seed = (hash + yearsAgo * 17) % 100;

    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);

    return {
      symbol: symbol,
      gfScore: Math.min(100, 50 + (seed % 51)), // 50-100
      gfValue: Math.round((50 + (seed % 200)) * 100) / 100,
      currentPrice: Math.round((40 + (seed % 180)) * 100) / 100,
      date: targetDate.toISOString().split('T')[0],
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = new GuruFocusService();
