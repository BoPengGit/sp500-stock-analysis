import React from 'react';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <h1>S&P 500 Stock Evaluator</h1>
        <p className="subtitle">
          Ranking stocks by Market Cap (25%), ADTV (25%), P/S Ratio (25%), and Sales Growth (25%)
        </p>
        <div className="live-data-badge">
          <span className="badge-dot"></span>
          Live Data from Financial Modeling Prep API
        </div>
      </div>
    </header>
  );
}

export default Header;
