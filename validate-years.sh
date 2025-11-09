#!/bin/bash

for year in 1 2 3 4 5; do
  echo "========================================="
  echo "Testing Year $year"
  echo "========================================="
  curl -s "http://localhost:5000/api/stocks/historical-top-stocks?yearsAgo=$year&limit=3&marketCap=30&adtv=15&priceToSales=15&salesGrowth=20&gfScore=20" | python3 << 'EOF'
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print(f'✓ Success - {data["metadata"]["totalStocksEvaluated"]} stocks evaluated')
        print(f'Top 3 stocks:')
        for i, s in enumerate(data['data'][:3]):
            mc = s.get('marketCap')
            ps = s.get('priceToSales')
            sg = s.get('salesGrowth')
            gf = s.get('gfScore')
            ws = s.get('weightedScore')

            mc_str = f"{mc/1e9:.1f}B" if mc else "N/A"
            ps_str = f"{ps:.2f}" if ps is not None else "N/A"
            sg_str = f"{sg:.1f}%" if sg is not None else "N/A"
            gf_str = str(gf) if gf else "N/A"
            ws_str = f"{ws:.2f}" if ws is not None else "N/A"

            print(f'  {i+1}. {s["symbol"]:6s} MC:${mc_str:8s} P/S:{ps_str:6s} SG:{sg_str:7s} GF:{gf_str:3s} Score:{ws_str}')
    else:
        print(f'✗ Error: {data.get("error", "Unknown error")}')
        print(f'  Message: {data.get("message", "N/A")}')
except Exception as e:
    print(f'✗ Exception: {str(e)}')
EOF
  echo ""
done
