/**
 * Test Script - Extract Historical GF Score Data Structure
 *
 * This script investigates how GuruFocus stores historical GF Score data
 * in the page to see if we can extract all years at once
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const guruFocusService = require('./server/services/guruFocusService');

async function main() {
  console.log('Testing historical GF Score extraction for AAPL...\n');

  const result = await guruFocusService.getAllHistoricalStockRankings('AAPL');

  console.log('\nResult:', JSON.stringify(result, null, 2));

  await guruFocusService.closeBrowser();

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  guruFocusService.closeBrowser().finally(() => {
    process.exit(1);
  });
});
