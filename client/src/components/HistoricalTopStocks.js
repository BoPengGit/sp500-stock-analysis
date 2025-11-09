import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PortfolioReturns.css';

function HistoricalTopStocks({ selectedWeights, onWeightChange, weightConfigs }) {
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(5); // Default to 5 years ago
  const [stockReturns, setStockReturns] = useState(null);
  const [loadingReturns, setLoadingReturns] = useState(false);

  useEffect(() => {
    fetchHistoricalStocks();
  }, [selectedWeights, selectedYear]);

  const fetchHistoricalStocks = async () => {
    setLoading(true);
    setError(null);
    setStockReturns(null); // Reset returns when fetching new stocks

    try {
      const weights = weightConfigs[selectedWeights];

      // If "All Years" is selected, fetch data for years 1-10 and combine
      if (selectedYear === -1) {
        const allYearsData = [];

        for (let year = 1; year <= 10; year++) {
          const params = {
            yearsAgo: year,
            marketCap: weights.marketCap,
            adtv: weights.adtv,
            priceToSales: weights.priceToSales,
            salesGrowth: weights.salesGrowth,
            gfScore: weights.gfScore,
            limit: 10
          };

          const response = await axios.get('/api/stocks/historical-top-stocks', { params });

          if (response.data.success) {
            // Add year label to each stock
            const stocksWithYear = response.data.data.map(stock => ({
              ...stock,
              year: year
            }));
            allYearsData.push(...stocksWithYear);
          }
        }

        setStocks(allYearsData);
      } else {
        // Single year fetch
        const params = {
          yearsAgo: selectedYear,
          marketCap: weights.marketCap,
          adtv: weights.adtv,
          priceToSales: weights.priceToSales,
          salesGrowth: weights.salesGrowth,
          gfScore: weights.gfScore,
          limit: 10
        };

        const response = await axios.get('/api/stocks/historical-top-stocks', { params });

        if (response.data.success) {
          setStocks(response.data.data);
          // Automatically fetch returns for the stocks
          if (selectedYear > 0) {
            fetchStockReturns(response.data.data.map(s => s.symbol));
          }
        } else {
          setError('Failed to fetch historical top stocks');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch historical stocks');
      console.error('Error fetching historical top stocks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockReturns = async (symbols) => {
    setLoadingReturns(true);
    try {
      const response = await axios.get('/api/stocks/historical-stock-returns', {
        params: {
          symbols: symbols.join(','),
          yearsAgo: selectedYear
        }
      });

      if (response.data.success) {
        setStockReturns(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching stock returns:', err);
      // Don't set error state, just log it - returns are optional
    } finally {
      setLoadingReturns(false);
    }
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value !== 'number') return value;

    // Format large numbers with commas
    if (Math.abs(value) >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    } else if (Math.abs(value) >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    } else if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return value.toFixed(2);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="portfolio-returns">
        <h2>Historical Top Stocks</h2>
        <p className="loading-text">Loading historical stock data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-returns">
        <h2>Historical Top Stocks</h2>
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!stocks) {
    return null;
  }

  return (
    <div className="portfolio-returns historical-stocks">
      <div className="returns-header">
        <h2>Historical Top Stocks</h2>
        <p className="strategy-description">
          View the top-ranked stocks from each of the past 10 years based on fundamental metrics
        </p>
      </div>

      <div className="weight-selector">
        <label>Weight Configuration:</label>
        <select
          value={selectedWeights}
          onChange={(e) => onWeightChange(e.target.value)}
        >
          {Object.entries(weightConfigs).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      <div className="weight-selector">
        <label>Select Year:</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
        >
          <option value={0}>Current Year (Year 0)</option>
          <option value={1}>1 Year Ago</option>
          <option value={2}>2 Years Ago</option>
          <option value={3}>3 Years Ago</option>
          <option value={4}>4 Years Ago</option>
          <option value={5}>5 Years Ago</option>
          <option value={6}>6 Years Ago</option>
          <option value={7}>7 Years Ago</option>
          <option value={8}>8 Years Ago</option>
          <option value={9}>9 Years Ago</option>
          <option value={10}>10 Years Ago</option>
          <option value={-1}>All Years (1-10)</option>
        </select>
      </div>

      <table className="returns-table historical-stocks-table">
        <thead>
          <tr>
            {selectedYear === -1 && <th>Year</th>}
            <th>Rank</th>
            <th>Symbol</th>
            <th>Name</th>
            <th>Market Cap</th>
            <th>Rank</th>
            <th>ADTV</th>
            <th>Rank</th>
            <th>Price/Sales</th>
            <th>Rank</th>
            <th>Sales Growth %</th>
            <th>Rank</th>
            <th>GF Score</th>
            <th>Rank</th>
            <th>Weighted Score</th>
            <th>P/E</th>
            <th>Rank</th>
            <th>D/E</th>
            <th>Rank</th>
            <th>Op. Margin</th>
            <th>Rank</th>
            <th>ROIC</th>
            <th>Rank</th>
            <th>FCF Yield</th>
            <th>Rank</th>
            <th>FCF Growth %</th>
            <th>Rank</th>
            <th>EPS Growth %</th>
            <th>Rank</th>
            <th>Revenue CAGR %</th>
            <th>Rank</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock, idx) => (
            <tr key={`${stock.symbol}-${stock.year || selectedYear}-${idx}`}>
              {selectedYear === -1 && (
                <td className="year-cell"><strong>Year {stock.year}</strong></td>
              )}
              <td className="rank-cell">{selectedYear === -1 ? (idx % 10) + 1 : idx + 1}</td>
              <td className="symbol-cell"><strong>{stock.symbol}</strong></td>
              <td className="name-cell">
                {stock.name}
                {stock.additionalData?.sector && (
                  <span className="sector-tag">{stock.additionalData.sector}</span>
                )}
              </td>

              <td className="value-cell">{formatNumber(stock.marketCap)}</td>
              <td className="rank-cell">{stock.ranks?.marketCap || 'N/A'}</td>

              <td className="value-cell">{formatNumber(stock.adtv)}</td>
              <td className="rank-cell">{stock.ranks?.adtv || 'N/A'}</td>

              <td className="value-cell">{stock.priceToSales ? stock.priceToSales.toFixed(2) : 'N/A'}</td>
              <td className="rank-cell">{stock.ranks?.priceToSales || 'N/A'}</td>

              <td className={`value-cell ${stock.salesGrowth >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(stock.salesGrowth)}
              </td>
              <td className="rank-cell">{stock.ranks?.salesGrowth || 'N/A'}</td>

              <td className="value-cell">{stock.gfScore || 'N/A'}</td>
              <td className="rank-cell">{stock.ranks?.gfScore || 'N/A'}</td>

              <td className="score-cell"><strong>{stock.weightedScore?.toFixed(2) || 'N/A'}</strong></td>

              <td className="value-cell">{stock.peRatio ? formatNumber(stock.peRatio) : 'N/A'}</td>
              <td className="rank-cell">{stock.ranks?.peRatio || 'N/A'}</td>

              <td className="value-cell">{stock.debtToEquity !== null && stock.debtToEquity !== undefined ? formatNumber(stock.debtToEquity) : 'N/A'}</td>
              <td className="rank-cell">{stock.ranks?.debtToEquity || 'N/A'}</td>

              <td className={`value-cell ${stock.operatingMargin >= 0.2 ? 'positive' : ''}`}>
                {stock.operatingMargin !== null && stock.operatingMargin !== undefined ? formatPercent(stock.operatingMargin * 100) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.operatingMargin || 'N/A'}</td>

              <td className={`value-cell ${stock.roic >= 0.15 ? 'positive' : ''}`}>
                {stock.roic !== null && stock.roic !== undefined ? formatPercent(stock.roic * 100) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.roic || 'N/A'}</td>

              <td className={`value-cell ${stock.fcfYield >= 0.05 ? 'positive' : ''}`}>
                {stock.fcfYield !== null && stock.fcfYield !== undefined ? formatPercent(stock.fcfYield * 100) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.fcfYield || 'N/A'}</td>

              <td className={`value-cell ${stock.fcfGrowth >= 0 ? 'positive' : 'negative'}`}>
                {stock.fcfGrowth !== null && stock.fcfGrowth !== undefined ? formatPercent(stock.fcfGrowth) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.fcfGrowth || 'N/A'}</td>

              <td className={`value-cell ${stock.epsGrowth >= 0 ? 'positive' : 'negative'}`}>
                {stock.epsGrowth !== null && stock.epsGrowth !== undefined ? formatPercent(stock.epsGrowth) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.epsGrowth || 'N/A'}</td>

              <td className={`value-cell ${stock.revenueCagr >= 0 ? 'positive' : 'negative'}`}>
                {stock.revenueCagr !== null && stock.revenueCagr !== undefined ? formatPercent(stock.revenueCagr) : 'N/A'}
              </td>
              <td className="rank-cell">{stock.ranks?.revenueCagr || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="returns-note">
        <p>
          <strong>Note:</strong> Showing top 10 stocks from {
            selectedYear === -1
              ? 'each of the past 10 years (Years 1-10)'
              : selectedYear === 0
                ? 'the current year'
                : `${selectedYear} year${selectedYear > 1 ? 's' : ''} ago`
          } based on their fundamental metrics at that time. Lower weighted score = better overall ranking.
        </p>
      </div>

      {selectedYear > 0 && (
        <div className="individual-returns">
          <h3>Annual Stock Performance ({selectedYear === 1 ? '1 Year' : `Year ${selectedYear}`})</h3>

          {loadingReturns && (
            <p className="loading-text">Loading stock returns...</p>
          )}

          {!loadingReturns && stockReturns && (
            <div className="stock-returns-table-container">
              <table className="stock-returns-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Symbol</th>
                    <th>Start Price</th>
                    <th>End Price</th>
                    <th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReturns
                    .sort((a, b) => (b.return || -Infinity) - (a.return || -Infinity))
                    .map((stock, idx) => (
                      <tr key={stock.symbol}>
                        <td className="rank-cell">{idx + 1}</td>
                        <td className="symbol-cell">{stock.symbol}</td>
                        <td className="value-cell">
                          {stock.startPrice ? `$${stock.startPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="value-cell">
                          {stock.endPrice ? `$${stock.endPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className={`return-cell ${stock.return >= 0 ? 'positive' : 'negative'}`}>
                          {stock.return !== null && stock.return !== undefined
                            ? `${stock.return > 0 ? '+' : ''}${stock.return.toFixed(2)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingReturns && stockReturns && (
            <div className="returns-note">
              <p>
                <strong>Performance Summary:</strong> Returns calculated from the start of the selected year to one year later.
                Stocks are ranked by their annual return performance.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HistoricalTopStocks;
