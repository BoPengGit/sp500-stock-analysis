import React from 'react';
import './Statistics.css';

function Statistics({ stats }) {
  const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatMarketCap = (marketCap) => {
    if (!marketCap || isNaN(marketCap)) return 'N/A';
    const billions = marketCap / 1e9;
    return `$${formatNumber(billions, 2)}B`;
  };

  return (
    <div className="statistics">
      <h2>Market Statistics</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Stocks</h3>
          <div className="stat-value">{stats.totalStocks}</div>
        </div>

        <div className="stat-card">
          <h3>Market Cap</h3>
          <div className="stat-row">
            <span className="stat-label">Average:</span>
            <span className="stat-number">{formatMarketCap(stats.marketCap.average)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Median:</span>
            <span className="stat-number">{formatMarketCap(stats.marketCap.median)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Max:</span>
            <span className="stat-number">{formatMarketCap(stats.marketCap.max)}</span>
          </div>
        </div>

        <div className="stat-card">
          <h3>ADTV</h3>
          <div className="stat-row">
            <span className="stat-label">Average:</span>
            <span className="stat-number">{formatNumber(stats.adtv.average / 1e6)}M</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Median:</span>
            <span className="stat-number">{formatNumber(stats.adtv.median / 1e6)}M</span>
          </div>
        </div>

        <div className="stat-card">
          <h3>P/S Ratio</h3>
          <div className="stat-row">
            <span className="stat-label">Average:</span>
            <span className="stat-number">{formatNumber(stats.priceToSales.average)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Median:</span>
            <span className="stat-number">{formatNumber(stats.priceToSales.median)}</span>
          </div>
        </div>

        <div className="stat-card">
          <h3>Sales Growth</h3>
          <div className="stat-row">
            <span className="stat-label">Average:</span>
            <span className="stat-number">{formatNumber(stats.salesGrowth.average)}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Median:</span>
            <span className="stat-number">{formatNumber(stats.salesGrowth.median)}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Positive:</span>
            <span className="stat-number positive">{stats.salesGrowth.positive}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Negative:</span>
            <span className="stat-number negative">{stats.salesGrowth.negative}</span>
          </div>
        </div>
      </div>

      {stats.garp && (
        <>
          <h2 style={{ marginTop: '2rem' }}>GARP Metrics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>P/E Ratio</h3>
              <div className="stat-row">
                <span className="stat-label">Average:</span>
                <span className="stat-number">{formatNumber(stats.garp.peRatio.average)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Median:</span>
                <span className="stat-number">{formatNumber(stats.garp.peRatio.median)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coverage:</span>
                <span className="stat-number">{stats.garp.peRatio.coverage}</span>
              </div>
            </div>

            <div className="stat-card">
              <h3>Debt/Equity</h3>
              <div className="stat-row">
                <span className="stat-label">Average:</span>
                <span className="stat-number">{formatNumber(stats.garp.debtToEquity.average)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Median:</span>
                <span className="stat-number">{formatNumber(stats.garp.debtToEquity.median)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coverage:</span>
                <span className="stat-number">{stats.garp.debtToEquity.coverage}</span>
              </div>
            </div>

            <div className="stat-card">
              <h3>Operating Margin</h3>
              <div className="stat-row">
                <span className="stat-label">Average:</span>
                <span className="stat-number">{formatNumber(stats.garp.operatingMargin.average)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Median:</span>
                <span className="stat-number">{formatNumber(stats.garp.operatingMargin.median)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coverage:</span>
                <span className="stat-number">{stats.garp.operatingMargin.coverage}</span>
              </div>
            </div>

            <div className="stat-card">
              <h3>ROIC</h3>
              <div className="stat-row">
                <span className="stat-label">Average:</span>
                <span className="stat-number">{formatNumber(stats.garp.roic.average)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Median:</span>
                <span className="stat-number">{formatNumber(stats.garp.roic.median)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coverage:</span>
                <span className="stat-number">{stats.garp.roic.coverage}</span>
              </div>
            </div>

            <div className="stat-card">
              <h3>FCF Yield</h3>
              <div className="stat-row">
                <span className="stat-label">Average:</span>
                <span className="stat-number">{formatNumber(stats.garp.fcfYield.average)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Median:</span>
                <span className="stat-number">{formatNumber(stats.garp.fcfYield.median)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coverage:</span>
                <span className="stat-number">{stats.garp.fcfYield.coverage}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Statistics;
