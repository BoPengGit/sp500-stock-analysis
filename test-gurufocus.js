/**
 * Test script to scrape GuruFocus and inspect the page structure
 */

const puppeteer = require('puppeteer');

async function testGuruFocus(symbol = 'AAPL') {
  console.log(`Testing GuruFocus scraper for ${symbol}...`);

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const url = `https://www.gurufocus.com/stock/${symbol}/summary`;
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  console.log('Page loaded. Taking screenshot...');
  await page.screenshot({ path: 'gurufocus-test.png', fullPage: true });

  console.log('Extracting page HTML structure...');
  const html = await page.content();

  // Save HTML for inspection
  const fs = require('fs');
  fs.writeFileSync('gurufocus-page.html', html);
  console.log('HTML saved to gurufocus-page.html');

  // Try to extract GF Value using various methods
  console.log('\nAttempting to extract GF Value...');

  const data = await page.evaluate(() => {
    const result = {
      allText: [],
      gfValueCandidates: [],
      priceInfo: []
    };

    // Get all text that contains "GF Value" or dollar signs
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text.includes('GF Value') || text.includes('$')) {
        result.allText.push({
          text: text,
          parent: node.parentElement?.className,
          tag: node.parentElement?.tagName
        });
      }
    }

    // Look for elements with specific class names or IDs
    const selectors = [
      '.gf-value',
      '#gf-value',
      '[data-test="gf-value"]',
      '.valuation',
      '.stock-price',
      '[class*="GF"]',
      '[class*="value"]',
      '[class*="price"]'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        result.gfValueCandidates.push({
          selector: selector,
          text: el.textContent.trim(),
          className: el.className,
          id: el.id
        });
      });
    });

    return result;
  });

  console.log('\n=== Extracted Data ===');
  console.log('Text containing GF Value or $:');
  data.allText.slice(0, 20).forEach((item, i) => {
    console.log(`  ${i + 1}. "${item.text.substring(0, 100)}" (${item.tag}.${item.parent})`);
  });

  console.log('\nGF Value candidates:');
  data.gfValueCandidates.slice(0, 10).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.selector}: "${item.text.substring(0, 100)}"`);
  });

  console.log('\nWaiting 5 seconds before closing...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  await browser.close();
  console.log('\nTest complete!');
}

// Run the test
testGuruFocus('AAPL').catch(console.error);
