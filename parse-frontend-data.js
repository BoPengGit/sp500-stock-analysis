// This script parses the HTML table data and extracts the values we need
// The columns in the table are:
// Rank, Symbol, Name/Sector, MarketCap, MC_Rank, ADTV, ADTV_Rank, P/S, PS_Rank, SalesGrowth, SG_Rank, etc...

const htmlData = `PASTE_HTML_HERE`;

// The structure based on the sample row for NVDA:
// #1  NVDA  NVIDIA Corporation [Technology]  $4,580.89B  1  262.85M  1  27.73  496  114.20%  1  99/100 1 ...

// Let me create a simple parser that extracts just what we need from each row
// Looking at the HTML pattern, I see each stock has this pattern after parsing:
// Symbol, MarketCap (in billions with $), ADTV (in millions with M), PriceToSales (number), SalesGrowth (percentage)

const rawData = `NVDA	$4,580.89B	262.85M	27.73	114.20%
META	$1,567.04B	29.73M	8.27	21.94%
MU	$265.52B	30.35M	7.10	48.85%`;

// Parse each line
function parseValue(value) {
  if (!value) return null;

  // Remove $ and B for market cap (billions)
  if (value.includes('$') && value.includes('B')) {
    return parseFloat(value.replace('$', '').replace('B', '').replace(',', '')) * 1000000000;
  }

  // Remove M for ADTV (millions)
  if (value.includes('M')) {
    return parseFloat(value.replace('M', '').replace(',', '')) * 1000000;
  }

  // Remove % for percentages
  if (value.includes('%')) {
    return parseFloat(value.replace('%', '').replace(',', ''));
  }

  // Plain number
  return parseFloat(value.replace(',', ''));
}

console.log('Sample parsing:');
const lines = rawData.split('\n');
lines.forEach(line => {
  const parts = line.split('\t');
  const symbol = parts[0];
  const marketCap = parseValue(parts[1]);
  const adtv = parseValue(parts[2]);
  const priceToSales = parseValue(parts[3]);
  const salesGrowth = parseValue(parts[4]);

  console.log({
    symbol,
    marketCap,
    adtv,
    priceToSales,
    salesGrowth
  });
});
