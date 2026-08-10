# A3 Elite Terminal

![Elite Intelligence for Traders](./banner.png)

[![Instagram](https://img.shields.io/badge/Instagram-%40mrhenderson.251-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/mrhenderson.251)
[![Telegram](https://img.shields.io/badge/Telegram-%40a3en3-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/a3en3)

A professional-grade, real-time financial market terminal designed for high-performance market monitoring across Forex, Metals, Indices, Crypto, and Commodities.

## 🚀 Features

- **Real-Time Market Data**: Live price updates via WebSockets for low-latency monitoring.
- **Multi-Asset Support**: Comprehensive coverage of Forex Majors, Crosses, Metals (Gold, Silver, Platinum, Palladium), Global Indices, Cryptocurrencies, and Commodities.
- **Advanced Market Analysis**:
  - **Currency Indexes**: Real-time calculation of currency strength indexes for better utilization.
  - **Trading Sessions**: Visual tracking of Sydney, Tokyo, London, and New York sessions.

- **Interactive Charts**: High-performance charts for every asset.
- **Economic Calendar**: Real-time tracking of high-impact news events.
- **Responsive Design**: Optimized for both desktop and mobile trading environments.
- **Robust Data Pipeline**: Multi-source API integration with automatic failover

## 🚀 **CORE TRADING FEATURES**

### 1. **Multi-Asset Coverage (60+ Instruments)**
- **Forex Majors (7):** EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD
- **Forex Crosses (12):** EUR/JPY, GBP/JPY, EUR/GBP, EUR/AUD, EUR/CHF, GBP/CHF, GBP/AUD, AUD/JPY, CHF/JPY, CAD/JPY, AUD/NZD, NZD/JPY
- **Precious Metals (4):** Gold (XAU/USD), Silver (XAG/USD), Platinum (XPT/USD), Palladium (XPD/USD)
- **Indices (9):** US30, NAS100, SPX500, UK100, GER40, FRA40, JPN225, AUS200, HK50
- **Cryptocurrencies (10):** BTC, ETH, BNB, XRP, SOL, ADA, DOT, MATIC, LINK, AVAX
- **Commodities (3):** US Oil (WTI), UK Oil (Brent), Natural Gas

---

## 📊 **ANALYSIS SUITE**
## 🎯 **SIGNAL GENERATION SYSTEM**
---

## 🔍 **ADVANCED FEATURES**
### -> **Multi-Pair Screener**
- Scan all Forex pairs (19 pairs)
- Scan all Crypto (10 pairs)
- Scan all Indices (9 pairs)
- Scan ALL markets (60+ pairs)

-> ### **Economic Calendar**
-> ### **Correlation Matrix** 
-> ### **Performance Analytics** 
-> ### **Market Heatmap** 
-> ### **Live News Feed** 
-> ### **Alerts Manager** 
-> ## 📱 **TELEGRAM INTEGRATION for MOBILE NOTIFICATION**
-> ## 📒 **TRADE JOURNAL**
-> ## 🤖 **AI CHART ANALYSIS**

Built by A3EN with ❤️ for the trading community.

## Local development

Install JavaScript dependencies with `pnpm install --frozen-lockfile` or `npm install`, then start the app with `pnpm run dev`. The server tries the requested `PORT` first and automatically falls back through `3000`, `3001`, `3002`, `3003`, `4173`, `5173`, and `8080` if a port is occupied. Set `VITE_HMR_PORT=0` to let Vite select an available HMR port, which avoids sandbox 410/unreachable failures caused by a stale HMR port.

See `.env.example` for runtime configuration and `requirements.txt` for the external service requirements.
