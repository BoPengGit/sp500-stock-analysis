import React, { useState } from 'react';
import './StockTable.css';

function StockTable({ stocks }) {
  const [sortConfig, setSortConfig] = useState({ key: 'overallRank', direction: 'asc' });

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

  const formatVolume = (volume) => {
    if (!volume || isNaN(volume)) return 'N/A';
    const millions = volume / 1e6;
    return `${formatNumber(millions, 2)}M`;
  };

  const sortedStocks = React.useMemo(() => {
    const sorted = [...stocks].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle nested ranks
      if (sortConfig.key.includes('.')) {
        const keys = sortConfig.key.split('.');
        aValue = keys.reduce((obj, key) => obj?.[key], a);
        bValue = keys.reduce((obj, key) => obj?.[key], b);
      }

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return sorted;
  }, [stocks, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="table-container">
      <table className="stock-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('overallRank')} className="sortable">
              Rank {getSortIcon('overallRank')}
            </th>
            <th onClick={() => handleSort('symbol')} className="sortable">
              Symbol {getSortIcon('symbol')}
            </th>
            <th onClick={() => handleSort('name')} className="sortable">
              Company Name {getSortIcon('name')}
            </th>
            <th onClick={() => handleSort('marketCap')} className="sortable">
              Market Cap<br/>
              <span className="weight">(20%)</span> {getSortIcon('marketCap')}
            </th>
            <th onClick={() => handleSort('ranks.marketCap')} className="sortable">
              MC Rank {getSortIcon('ranks.marketCap')}
            </th>
            <th onClick={() => handleSort('adtv')} className="sortable">
              ADTV<br/>
              <span className="weight">(20%)</span> {getSortIcon('adtv')}
            </th>
            <th onClick={() => handleSort('ranks.adtv')} className="sortable">
              ADTV Rank {getSortIcon('ranks.adtv')}
            </th>
            <th onClick={() => handleSort('priceToSales')} className="sortable">
              P/S Ratio<br/>
              <span className="weight">(20%)</span> {getSortIcon('priceToSales')}
            </th>
            <th onClick={() => handleSort('ranks.priceToSales')} className="sortable">
              P/S Rank {getSortIcon('ranks.priceToSales')}
            </th>
            <th onClick={() => handleSort('salesGrowth')} className="sortable">
              Sales Growth<br/>
              <span className="weight">(20%)</span> {getSortIcon('salesGrowth')}
            </th>
            <th onClick={() => handleSort('ranks.salesGrowth')} className="sortable">
              SG Rank {getSortIcon('ranks.salesGrowth')}
            </th>
            <th onClick={() => handleSort('gfScore')} className="sortable">
              GF Score<br/>
              <span className="weight">(20%)</span> {getSortIcon('gfScore')}
            </th>
            <th onClick={() => handleSort('ranks.gfScore')} className="sortable">
              GF Rank {getSortIcon('ranks.gfScore')}
            </th>
            <th onClick={() => handleSort('weightedScore')} className="sortable">
              Score {getSortIcon('weightedScore')}
            </th>
            <th onClick={() => handleSort('peRatio')} className="sortable">
              P/E {getSortIcon('peRatio')}
            </th>
            <th onClick={() => handleSort('ranks.peRatio')} className="sortable">
              P/E Rank {getSortIcon('ranks.peRatio')}
            </th>
            <th onClick={() => handleSort('debtToEquity')} className="sortable">
              D/E {getSortIcon('debtToEquity')}
            </th>
            <th onClick={() => handleSort('ranks.debtToEquity')} className="sortable">
              D/E Rank {getSortIcon('ranks.debtToEquity')}
            </th>
            <th onClick={() => handleSort('operatingMargin')} className="sortable">
              Op. Margin {getSortIcon('operatingMargin')}
            </th>
            <th onClick={() => handleSort('ranks.operatingMargin')} className="sortable">
              OpM Rank {getSortIcon('ranks.operatingMargin')}
            </th>
            <th onClick={() => handleSort('roic')} className="sortable">
              ROIC {getSortIcon('roic')}
            </th>
            <th onClick={() => handleSort('ranks.roic')} className="sortable">
              ROIC Rank {getSortIcon('ranks.roic')}
            </th>
            <th onClick={() => handleSort('fcfYield')} className="sortable">
              FCF Yield {getSortIcon('fcfYield')}
            </th>
            <th onClick={() => handleSort('ranks.fcfYield')} className="sortable">
              FCF Rank {getSortIcon('ranks.fcfYield')}
            </th>
            <th onClick={() => handleSort('fcfGrowth')} className="sortable">
              FCF Growth {getSortIcon('fcfGrowth')}
            </th>
            <th onClick={() => handleSort('ranks.fcfGrowth')} className="sortable">
              FCF Growth Rank {getSortIcon('ranks.fcfGrowth')}
            </th>
            <th onClick={() => handleSort('epsGrowth')} className="sortable">
              EPS Growth {getSortIcon('epsGrowth')}
            </th>
            <th onClick={() => handleSort('ranks.epsGrowth')} className="sortable">
              EPS Growth Rank {getSortIcon('ranks.epsGrowth')}
            </th>
            <th onClick={() => handleSort('revenueCagr')} className="sortable">
              Revenue CAGR {getSortIcon('revenueCagr')}
            </th>
            <th onClick={() => handleSort('ranks.revenueCagr')} className="sortable">
              Rev CAGR Rank {getSortIcon('ranks.revenueCagr')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStocks.map((stock, index) => (
            <tr key={stock.symbol} className={index % 2 === 0 ? 'even' : 'odd'}>
              <td className="rank-cell">
                <span className={`rank-badge ${stock.overallRank <= 10 ? 'top-10' : ''}`}>
                  #{stock.overallRank}
                </span>
              </td>
              <td className="symbol-cell">{stock.symbol}</td>
              <td className="name-cell">
                {stock.name}
                {stock.additionalData?.sector && (
                  <span className="sector-tag">{stock.additionalData.sector}</span>
                )}
              </td>
              <td className="number-cell">{formatMarketCap(stock.marketCap)}</td>
              <td className="rank-number">{stock.ranks?.marketCap || 'N/A'}</td>
              <td className="number-cell">{formatVolume(stock.adtv)}</td>
              <td className="rank-number">{stock.ranks?.adtv || 'N/A'}</td>
              <td className="number-cell">{formatNumber(stock.priceToSales)}</td>
              <td className="rank-number">{stock.ranks?.priceToSales || 'N/A'}</td>
              <td className={`number-cell ${stock.salesGrowth > 0 ? 'positive' : 'negative'}`}>
                {formatNumber(stock.salesGrowth)}%
              </td>
              <td className="rank-number">{stock.ranks?.salesGrowth || 'N/A'}</td>
              <td className="number-cell">{stock.gfScore || 'N/A'}/100</td>
              <td className="rank-number">{stock.ranks?.gfScore || 'N/A'}</td>
              <td className="score-cell">{formatNumber(stock.weightedScore)}</td>
              <td className="number-cell">{formatNumber(stock.peRatio)}</td>
              <td className="rank-number">{stock.ranks?.peRatio || 'N/A'}</td>
              <td className="number-cell">{formatNumber(stock.debtToEquity)}</td>
              <td className="rank-number">{stock.ranks?.debtToEquity || 'N/A'}</td>
              <td className={`number-cell ${stock.operatingMargin >= 20 ? 'positive' : ''}`}>
                {stock.operatingMargin !== null && stock.operatingMargin !== undefined ? `${formatNumber(stock.operatingMargin)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.operatingMargin || 'N/A'}</td>
              <td className={`number-cell ${stock.roic >= 15 ? 'positive' : ''}`}>
                {stock.roic !== null && stock.roic !== undefined ? `${formatNumber(stock.roic)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.roic || 'N/A'}</td>
              <td className={`number-cell ${stock.fcfYield >= 5 ? 'positive' : ''}`}>
                {stock.fcfYield !== null && stock.fcfYield !== undefined ? `${formatNumber(stock.fcfYield)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.fcfYield || 'N/A'}</td>
              <td className={`number-cell ${stock.fcfGrowth > 0 ? 'positive' : 'negative'}`}>
                {stock.fcfGrowth !== null && stock.fcfGrowth !== undefined ? `${formatNumber(stock.fcfGrowth)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.fcfGrowth || 'N/A'}</td>
              <td className={`number-cell ${stock.epsGrowth > 0 ? 'positive' : 'negative'}`}>
                {stock.epsGrowth !== null && stock.epsGrowth !== undefined ? `${formatNumber(stock.epsGrowth)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.epsGrowth || 'N/A'}</td>
              <td className={`number-cell ${stock.revenueCagr > 0 ? 'positive' : 'negative'}`}>
                {stock.revenueCagr !== null && stock.revenueCagr !== undefined ? `${formatNumber(stock.revenueCagr)}%` : 'N/A'}
              </td>
              <td className="rank-number">{stock.ranks?.revenueCagr || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StockTable;
