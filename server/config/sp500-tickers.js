/**
 * S&P 500 Stock Tickers
 * Updated: January 2025
 * Source: stockanalysis.com
 *
 * Note: The list contains 502 ticker symbols representing the ~500 companies in the S&P 500.
 * Some companies have multiple share classes (e.g., GOOG and GOOGL for Alphabet, FOX and FOXA, BRK.B and BF.B).
 */

const SP500_TICKERS = [
  'NVDA', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'AVGO', 'META', 'TSLA', 'BRK-B',
  'JPM', 'LLY', 'WMT', 'ORCL', 'V', 'MA', 'XOM', 'NFLX', 'JNJ', 'PLTR',
  'COST', 'BAC', 'ABBV', 'AMD', 'HD', 'PG', 'GE', 'CVX', 'KO', 'UNH',
  'IBM', 'CSCO', 'WFC', 'MU', 'CAT', 'MS', 'AXP', 'GS', 'PM', 'RTX',
  'TMUS', 'CRM', 'ABT', 'TMO', 'MRK', 'MCD', 'APP', 'LRCX', 'DIS', 'ISRG',
  'LIN', 'PEP', 'UBER', 'AMAT', 'QCOM', 'INTC', 'INTU', 'C', 'BX', 'NOW',
  'BLK', 'T', 'NEE', 'SCHW', 'AMGN', 'APH', 'ANET', 'VZ', 'TJX', 'BKNG',
  'KLAC', 'GEV', 'ACN', 'SPGI', 'DHR', 'BSX', 'BA', 'GILD', 'TXN', 'ETN',
  'PANW', 'PFE', 'COF', 'ADBE', 'SYK', 'CRWD', 'UNP', 'LOW', 'WELL', 'PGR',
  'DE', 'HON', 'PLD', 'MDT', 'HOOD', 'CB', 'ADI', 'CEG', 'HCA', 'KKR',
  'COP', 'PH', 'LMT', 'D', 'MCK', 'VRTX', 'ADP', 'SO', 'CVS', 'CME',
  'CMCSA', 'DELL', 'MO', 'SBUX', 'TT', 'DUK', 'BMY', 'GD', 'NEM', 'NKE',
  'CDNS', 'MMC', 'MMM', 'DASH', 'MCO', 'ICE', 'SHW', 'COIN', 'AMT', 'HWM',
  'ORLY', 'UPS', 'WM', 'NOC', 'EQIX', 'JCI', 'MAR', 'APO', 'BK', 'AON',
  'CTAS', 'MDLZ', 'USB', 'ABNB', 'GLW', 'SNPS', 'EMR', 'WMB', 'ECL', 'TDG',
  'PNC', 'TEL', 'ITW', 'CI', 'ELV', 'COR', 'RCL', 'SPG', 'MNST', 'REGN',
  'DDOG', 'PWR', 'GM', 'CSX', 'CMI', 'MSI', 'AEP', 'VST', 'AJG', 'NSC',
  'RSG', 'HLT', 'CL', 'ADSK', 'FTNT', 'TRV', 'PYPL', 'AZO', 'FDX', 'SRE',
  'WDAY', 'AFL', 'STX', 'DLR', 'KMI', 'MPC', 'APD', 'TFC', 'EOG', 'FCX',
  'IDXX', 'WBD', 'WDC', 'PSX', 'SLB', 'LHX', 'URI', 'VLO', 'ALL', 'ZTS',
  'F', 'O', 'ROST', 'PCAR', 'NXPI', 'BDX', 'MET', 'EA', 'NDAQ', 'PSA',
  'CARR', 'EW', 'CAH', 'ROP', 'XEL', 'AXON', 'BKR', 'FAST', 'EXC', 'MPWR',
  'GWW', 'AME', 'CBRE', 'LVS', 'ETR', 'MSCI', 'CTVA', 'KR', 'AMP', 'OKE',
  'TTWO', 'DHI', 'ROK', 'FICO', 'A', 'PEG', 'AIG', 'TGT', 'YUM', 'FANG',
  'OXY', 'CMG', 'PAYX', 'XYZ', 'CPRT', 'CCI', 'GRMN', 'DAL', 'VMC', 'EBAY',
  'PRU', 'TRGP', 'XYL', 'MLM', 'WEC', 'RMD', 'PCG', 'EQT', 'HIG', 'SYY',
  'VTR', 'IQV', 'TKO', 'ED', 'OTIS', 'CTSH', 'WAB', 'KDP', 'CCL', 'HSY',
  'KMB', 'FI', 'FIS', 'GEHC', 'NUE', 'NRG', 'STT', 'ACGL', 'LYV', 'VICI',
  'KVUE', 'RJF', 'CHTR', 'EXPE', 'EL', 'UAL', 'IBKR', 'WTW', 'KEYS', 'LEN',
  'HPE', 'IRM', 'IR', 'MCHP', 'HUM', 'VRSK', 'MTD', 'EXR', 'FOXA', 'ODFL',
  'EME', 'K', 'TSCO', 'KHC', 'FSLR', 'CSGP', 'MTB', 'TER', 'WRB', 'ROL',
  'DTE', 'ATO', 'FITB', 'AEE', 'FOX', 'ES', 'ADM', 'PPL', 'CBOE', 'BRO',
  'EXE', 'FE', 'SYF', 'STE', 'BR', 'CNP', 'CINF', 'AWK', 'EFX', 'AVB',
  'LDOS', 'GIS', 'DOV', 'HBAN', 'NTRS', 'HUBB', 'HPQ', 'VLTO', 'TDY', 'WSM',
  'SMCI', 'PHM', 'EQR', 'ULTA', 'HAL', 'JBL', 'BIIB', 'TPL', 'NTAP', 'PODD',
  'VRSN', 'TROW', 'STZ', 'CMS', 'CFG', 'STLD', 'WAT', 'EIX', 'DG', 'RF',
  'PPG', 'DXCM', 'DLTR', 'TPR', 'L', 'DVN', 'PTC', 'SBAC', 'TTD', 'LH',
  'CHD', 'INCY', 'NI', 'NVR', 'DRI', 'CTRA', 'IP', 'DGX', 'TYL', 'KEY',
  'LULU', 'RL', 'CPAY', 'WST', 'AMCR', 'ON', 'TRMB', 'TSN', 'SW', 'CDW',
  'CNC', 'EXPD', 'J', 'BG', 'PFG', 'APTV', 'GPN', 'PKG', 'SNA', 'GDDY',
  'CHRW', 'GPC', 'PNR', 'ZBH', 'MKC', 'EVRG', 'ESS', 'LNT', 'LII', 'INVH',
  'LUV', 'DD', 'WY', 'IT', 'BBY', 'PSKY', 'HOLX', 'JBHT', 'FTV', 'IFF',
  'GEN', 'DOW', 'MAA', 'NWSA', 'ERIE', 'NWS', 'UHS', 'TXT', 'ALLE', 'OMC',
  'FFIV', 'KIM', 'COO', 'DPZ', 'LYB', 'EG', 'AVY', 'ZBRA', 'BALL', 'CLX',
  'NDSN', 'REG', 'WYNN', 'CF', 'MAS', 'BXP', 'DOC', 'BF-B', 'IEX', 'UDR',
  'HST', 'SOLV', 'HII', 'HRL', 'BLDR', 'AKAM', 'DECK', 'JKHY', 'VTRS', 'BEN',
  'ALB', 'SJM', 'AIZ', 'CPT', 'DAY', 'HAS', 'SWK', 'PNW', 'GL', 'IVZ',
  'SWKS', 'RVTY', 'AES', 'FDS', 'EPAM', 'ALGN', 'ARE', 'MRNA', 'POOL', 'IPG',
  'BAX', 'AOS', 'TAP', 'CPB', 'GNRC', 'TECH', 'MGM', 'DVA', 'PAYC', 'LW',
  'NCLH', 'APA', 'HSIC', 'FRT', 'CRL', 'CAG', 'MOS', 'MOH', 'LKQ', 'MTCH',
  'EMN', 'MHK'
];

module.exports = { SP500_TICKERS };
