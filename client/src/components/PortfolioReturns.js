import React, { useState, useEffect } from 'react';
import './PortfolioReturns.css';

function PortfolioReturns({ selectedWeights, onWeightChange, weightConfigs }) {
  const [returns, setReturns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const fetchPortfolioReturns = async (weightsKey = selectedWeights) => {
    setLoading(true);
    setError(null);

    try {
      const weights = weightConfigs[weightsKey] || weightConfigs['35-35-15-15-0'];

      // Build params object - only include weight parameters if they differ from default (35-35-15-15-0)
      const params = new URLSearchParams({ n: '10' });

      // Only add weight parameters if using custom weights (not the default 35-35-15-15-0)
      if (weightsKey !== '35-35-15-15-0') {
        params.append('marketCap', weights.marketCap !== undefined ? weights.marketCap : 35);
        params.append('adtv', weights.adtv !== undefined ? weights.adtv : 35);
        params.append('priceToSales', weights.priceToSales !== undefined ? weights.priceToSales : 15);
        params.append('salesGrowth', weights.salesGrowth !== undefined ? weights.salesGrowth : 15);
        params.append('gfScore', weights.gfScore !== undefined ? weights.gfScore : 0);
      }

      const response = await fetch(`http://localhost:5000/api/stocks/portfolio-returns?${params}`);
      const data = await response.json();

      if (data.success) {
        setReturns(data.data);
      } else {
        setError(data.error || 'Failed to fetch portfolio returns');
      }
    } catch (err) {
      setError('Error connecting to server: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-fetch on component mount and when selectedWeights changes
    fetchPortfolioReturns();
  }, [selectedWeights]);

  const handleWeightChange = (weightsKey) => {
    // Call parent handler to update shared state and re-fetch stocks
    onWeightChange(weightsKey);
  };

  const formatReturn = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A';
    }
    const formatted = value.toFixed(2);
    return value >= 0 ? `+${formatted}%` : `${formatted}%`;
  };

  const getReturnClass = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '';
    return value >= 0 ? 'positive' : 'negative';
  };

  if (loading) {
    return (
      <div className="portfolio-returns">
        <h2>Equal-Weighted Portfolio Returns</h2>
        <div className="loading-message">Calculating returns...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-returns">
        <h2>Equal-Weighted Portfolio Returns</h2>
        <div className="error-message">{error}</div>
        <button onClick={fetchPortfolioReturns} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  if (!returns) {
    return null;
  }

  return (
    <div className="portfolio-returns">
      <div className="returns-header">
        <h2 onClick={() => setIsCollapsed(!isCollapsed)} style={{cursor: 'pointer'}}>
          {isCollapsed ? '▶' : '▼'} Equal-Weighted Portfolio Returns (Top 10 Stocks)
        </h2>
        {!isCollapsed && (
          <>
            <p className="returns-subtitle">
              Top 10 stocks with 10% allocation each, rebalanced quarterly
            </p>
            {returns.metadata?.rebalancingStrategy === 'quarterly' && (
              <p className="rebalancing-note">
                Returns calculated with quarterly rebalancing (every 3 months)
              </p>
            )}
            <div className="weight-selector">
          <label>Select Weight Configuration (MC-ADTV-P/S-Growth-GF):</label>
          <div className="weight-buttons">
            {Object.keys(weightConfigs).map(key => (
              <button
                key={key}
                onClick={() => handleWeightChange(key)}
                className={`weight-btn ${selectedWeights === key ? 'active' : ''}`}
              >
                {weightConfigs[key].label}
              </button>
            ))}
          </div>
        </div>

            <div className="returns-summary">
        <div className="summary-table">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Annualized Return</th>
                <th>Total Return</th>
                <th>Start Date</th>
                <th>Valid Stocks</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="period-label">1 Year</td>
                <td className={`return-value ${getReturnClass(returns.portfolio.oneYear)}`}>
                  {formatReturn(returns.portfolio.oneYear)}
                </td>
                <td className={`return-value ${getReturnClass(returns.portfolio.oneYearTotal)}`}>
                  {formatReturn(returns.portfolio.oneYearTotal)}
                </td>
                <td className="date-value">{returns.metadata?.periods?.oneYear || 'N/A'}</td>
                <td className="valid-stocks">{returns.portfolio.validStocks?.oneYear || 0}/10</td>
              </tr>
              <tr>
                <td className="period-label">2 Year</td>
                <td className={`return-value ${getReturnClass(returns.portfolio.twoYear)}`}>
                  {formatReturn(returns.portfolio.twoYear)}
                </td>
                <td className={`return-value ${getReturnClass(returns.portfolio.twoYearTotal)}`}>
                  {formatReturn(returns.portfolio.twoYearTotal)}
                </td>
                <td className="date-value">{returns.metadata?.periods?.twoYear || 'N/A'}</td>
                <td className="valid-stocks">{returns.portfolio.validStocks?.twoYear || 0}/10</td>
              </tr>
              <tr>
                <td className="period-label">3 Year</td>
                <td className={`return-value ${getReturnClass(returns.portfolio.threeYear)}`}>
                  {formatReturn(returns.portfolio.threeYear)}
                </td>
                <td className={`return-value ${getReturnClass(returns.portfolio.threeYearTotal)}`}>
                  {formatReturn(returns.portfolio.threeYearTotal)}
                </td>
                <td className="date-value">{returns.metadata?.periods?.threeYear || 'N/A'}</td>
                <td className="valid-stocks">{returns.portfolio.validStocks?.threeYear || 0}/10</td>
              </tr>
              <tr>
                <td className="period-label">4 Year</td>
                <td className={`return-value ${getReturnClass(returns.portfolio.fourYear)}`}>
                  {formatReturn(returns.portfolio.fourYear)}
                </td>
                <td className={`return-value ${getReturnClass(returns.portfolio.fourYearTotal)}`}>
                  {formatReturn(returns.portfolio.fourYearTotal)}
                </td>
                <td className="date-value">{returns.metadata?.periods?.fourYear || 'N/A'}</td>
                <td className="valid-stocks">{returns.portfolio.validStocks?.fourYear || 0}/10</td>
              </tr>
              <tr>
                <td className="period-label">4.99 Year</td>
                <td className={`return-value ${getReturnClass(returns.portfolio.fiveYear)}`}>
                  {formatReturn(returns.portfolio.fiveYear)}
                </td>
                <td className={`return-value ${getReturnClass(returns.portfolio.fiveYearTotal)}`}>
                  {formatReturn(returns.portfolio.fiveYearTotal)}
                </td>
                <td className="date-value">{returns.metadata?.periods?.fiveYear || 'N/A'}</td>
                <td className="valid-stocks">{returns.portfolio.validStocks?.fiveYear || 0}/10</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {returns.stocks && returns.stocks.length > 0 && (
        <div className="individual-returns">
          <h3>Individual Stock Returns</h3>
          <div className="stock-returns-table-container">
            <table className="stock-returns-table">
              <thead>
                <tr>
                  <th rowSpan="2">Symbol</th>
                  <th rowSpan="2">Weight</th>
                  <th colSpan="2">1 Year</th>
                  <th colSpan="2">2 Year</th>
                  <th colSpan="2">3 Year</th>
                  <th colSpan="2">4 Year</th>
                  <th colSpan="2">4.99 Year</th>
                </tr>
                <tr>
                  <th>Annual</th>
                  <th>Total</th>
                  <th>Annual</th>
                  <th>Total</th>
                  <th>Annual</th>
                  <th>Total</th>
                  <th>Annual</th>
                  <th>Total</th>
                  <th>Annual</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {returns.stocks.map(stock => (
                  <tr key={stock.symbol}>
                    <td className="symbol-cell">{stock.symbol}</td>
                    <td className="weight-cell">{stock.weight.toFixed(1)}%</td>
                    <td className={`return-cell ${getReturnClass(stock.returns.oneYear)}`}>
                      {formatReturn(stock.returns.oneYear)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.oneYearTotal)}`}>
                      {formatReturn(stock.returns.oneYearTotal)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.twoYear)}`}>
                      {formatReturn(stock.returns.twoYear)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.twoYearTotal)}`}>
                      {formatReturn(stock.returns.twoYearTotal)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.threeYear)}`}>
                      {formatReturn(stock.returns.threeYear)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.threeYearTotal)}`}>
                      {formatReturn(stock.returns.threeYearTotal)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.fourYear)}`}>
                      {formatReturn(stock.returns.fourYear)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.fourYearTotal)}`}>
                      {formatReturn(stock.returns.fourYearTotal)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.fiveYear)}`}>
                      {formatReturn(stock.returns.fiveYear)}
                    </td>
                    <td className={`return-cell ${getReturnClass(stock.returns.fiveYearTotal)}`}>
                      {formatReturn(stock.returns.fiveYearTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

            <button onClick={fetchPortfolioReturns} className="btn btn-secondary refresh-btn">
              Recalculate Returns
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default PortfolioReturns;
