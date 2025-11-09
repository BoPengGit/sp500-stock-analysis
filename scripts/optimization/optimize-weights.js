const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

function generateWeightCombinations() {
  const combinations = [];
  const step = 5;

  console.log('Generating all possible weight combinations...');

  for (let mc = 0; mc <= 100; mc += step) {
    for (let adtv = 0; adtv <= 100 - mc; adtv += step) {
      for (let ps = 0; ps <= 100 - mc - adtv; ps += step) {
        for (let sg = 0; sg <= 100 - mc - adtv - ps; sg += step) {
          const gf = 100 - mc - adtv - ps - sg;
          if (gf >= 0 && gf <= 100 && gf % step === 0) {
            combinations.push({ marketCap: mc, adtv: adtv, priceToSales: ps, salesGrowth: sg, gfScore: gf });
          }
        }
      }
    }
  }

  console.log(`Generated ${combinations.length} combinations`);
  return combinations;
}

async function testCombination(w, i, t, best) {
  try {
    if (i === 0) console.log('Starting first API call...');
    const startTime = Date.now();

    const r = await axios.get(`${API_BASE}/stocks/annual-rebalance`, {
      params: { marketCap: w.marketCap, adtv: w.adtv, priceToSales: w.priceToSales, salesGrowth: w.salesGrowth, gfScore: w.gfScore },
      timeout: 120000 // 2 minutes timeout
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (i === 0) console.log(`First API call completed in ${elapsed}s`);

    const d = r.data.data?.results?.['5year'];
    if (!d?.transactions) {
      if (i === 0) console.log('No 5-year transaction data available');
      return null;
    }

    let cum = 1.0, yr = [];
    for (let j = 0; j < d.transactions.length; j++) {
      if (d.transactions[j].action === 'BUY' && j+1 < d.transactions.length && d.transactions[j+1].action === 'SELL_ALL') {
        const ret = ((d.transactions[j+1].portfolioValue - d.transactions[j].portfolioValue) / d.transactions[j].portfolioValue) * 100;
        cum *= (1 + ret/100);
        yr.push(ret);
      }
    }

    const total = (cum - 1) * 100;
    if (i % 10 === 0) console.log(`${i}/${t} (${((i/t)*100).toFixed(1)}%) - Best: ${best ? best.toFixed(2) : 'N/A'}% - Last: ${total.toFixed(2)}%`);

    return { w, total, avg: yr.reduce((s,v)=>s+v,0)/yr.length, final: 10000*cum };
  } catch (e) {
    if (i < 5) console.log(`Error on combination ${i}:`, e.message);
    return null;
  }
}

async function run() {
  console.log('WEIGHT OPTIMIZATION - FINDING BEST 5-YEAR RETURN');
  const combs = generateWeightCombinations();
  const res = [];
  let best = null;
  const startTime = Date.now();

  for (let i = 0; i < combs.length; i++) {
    const r = await testCombination(combs[i], i, combs.length, best?.total);
    if (r) {
      res.push(r);
      if (!best || r.total > best.total) {
        best = r;
        console.log(`\n🎯 NEW BEST! ${r.total.toFixed(2)}% - MC:${r.w.marketCap} ADTV:${r.w.adtv} PS:${r.w.priceToSales} SG:${r.w.salesGrowth} GF:${r.w.gfScore}\n`);
      }
    }
    // Small delay every 50 calls to avoid overwhelming the server
    if (i % 50 === 0 && i > 0) await new Promise(resolve => setTimeout(resolve, 50));
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nCompleted all ${combs.length} combinations in ${totalTime} minutes`);
  
  res.sort((a,b) => b.total - a.total);
  console.log('\n=== TOP 10 ===');
  for (let i = 0; i < Math.min(10, res.length); i++) {
    const r = res[i];
    console.log(`${i+1}. ${r.total.toFixed(2)}% - MC:${r.w.marketCap} ADTV:${r.w.adtv} PS:${r.w.priceToSales} SG:${r.w.salesGrowth} GF:${r.w.gfScore} (Avg:${r.avg.toFixed(2)}%)`);
  }

  console.log(`\nOPTIMAL: MC:${res[0].w.marketCap}% ADTV:${res[0].w.adtv}% PS:${res[0].w.priceToSales}% SG:${res[0].w.salesGrowth}% GF:${res[0].w.gfScore}%`);
  console.log(`5-Year Return: ${res[0].total.toFixed(2)}% | Avg Annual: ${res[0].avg.toFixed(2)}% | $10k → $${res[0].final.toFixed(2)}`);
}

run().catch(console.error);
