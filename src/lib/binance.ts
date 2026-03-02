// QuentrexKillzone OS - Binance API Utilities

import type { PriceData, CandleData, OrderBook } from '@/types/trading';

const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/ws';

// Top 18 pairs by volume
export const TRADING_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'ETCUSDT',
  'FETUSDT', 'NEARUSDT', 'APTUSDT'
];

// Fetch 24h ticker data for all symbols
export async function fetch24hTickers(): Promise<PriceData[]> {
  try {
    const response = await fetch(`${BINANCE_FUTURES_API}/ticker/24hr`);
    if (!response.ok) throw new Error('Failed to fetch tickers');
    
    const data = await response.json();
    
    return data
      .filter((item: any) => TRADING_PAIRS.includes(item.symbol))
      .map((item: any) => ({
        symbol: item.symbol,
        price: parseFloat(item.lastPrice),
        priceChange: parseFloat(item.priceChange),
        priceChangePercent: parseFloat(item.priceChangePercent),
        high24h: parseFloat(item.highPrice),
        low24h: parseFloat(item.lowPrice),
        volume: parseFloat(item.volume),
        quoteVolume: parseFloat(item.quoteVolume),
        openPrice: parseFloat(item.openPrice),
        lastUpdate: Date.now()
      }))
      .sort((a: PriceData, b: PriceData) => b.quoteVolume - a.quoteVolume);
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return [];
  }
}

// Fetch klines/candlestick data
export async function fetchKlines(
  symbol: string, 
  interval: string = '15m', 
  limit: number = 100
): Promise<CandleData[]> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Failed to fetch klines');
    
    const data = await response.json();
    
    return data.map((item: any) => ({
      openTime: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      closeTime: item[6],
      quoteVolume: parseFloat(item[7]),
      trades: item[8]
    }));
  } catch (error) {
    console.error('Error fetching klines:', error);
    return [];
  }
}

// Fetch order book depth
export async function fetchOrderBook(symbol: string, limit: number = 20): Promise<OrderBook | null> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_API}/depth?symbol=${symbol}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Failed to fetch orderbook');
    
    const data = await response.json();
    
    const transformLevel = (items: any[]) => {
      let total = 0;
      return items.map((item: any) => {
        const qty = parseFloat(item[1]);
        total += qty;
        return {
          price: parseFloat(item[0]),
          quantity: qty,
          total
        };
      });
    };
    
    return {
      lastUpdateId: data.lastUpdateId,
      bids: transformLevel(data.bids),
      asks: transformLevel(data.asks)
    };
  } catch (error) {
    console.error('Error fetching orderbook:', error);
    return null;
  }
}

// Fetch funding rate
export async function fetchFundingRate(symbol: string): Promise<number> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_API}/fundingRate?symbol=${symbol}&limit=1`
    );
    if (!response.ok) throw new Error('Failed to fetch funding rate');
    
    const data = await response.json();
    return parseFloat(data[0]?.fundingRate || '0');
  } catch (error) {
    console.error('Error fetching funding rate:', error);
    return 0;
  }
}

// Fetch open interest
export async function fetchOpenInterest(symbol: string): Promise<{ openInterest: number; time: number }> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_API}/openInterest?symbol=${symbol}`
    );
    if (!response.ok) throw new Error('Failed to fetch open interest');
    
    const data = await response.json();
    return {
      openInterest: parseFloat(data.openInterest),
      time: data.time
    };
  } catch (error) {
    console.error('Error fetching open interest:', error);
    return { openInterest: 0, time: Date.now() };
  }
}

// Fetch all funding rates
export async function fetchAllFundingRates(): Promise<Record<string, number>> {
  try {
    const response = await fetch(`${BINANCE_FUTURES_API}/fundingRate?limit=1000`);
    if (!response.ok) throw new Error('Failed to fetch funding rates');
    
    const data = await response.json();
    const rates: Record<string, number> = {};
    
    data.forEach((item: any) => {
      if (!rates[item.symbol]) {
        rates[item.symbol] = parseFloat(item.fundingRate);
      }
    });
    
    return rates;
  } catch (error) {
    console.error('Error fetching all funding rates:', error);
    return {};
  }
}

// Create WebSocket connection for real-time data
export function createTickerWebSocket(
  symbols: string[],
  onMessage: (data: PriceData) => void,
  onError?: (error: Event) => void
): WebSocket | null {
  try {
    const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
    const ws = new WebSocket(`${BINANCE_FUTURES_WS}/${streams}`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const priceData: PriceData = {
          symbol: data.s,
          price: parseFloat(data.c),
          priceChange: parseFloat(data.p),
          priceChangePercent: parseFloat(data.P),
          high24h: parseFloat(data.h),
          low24h: parseFloat(data.l),
          volume: parseFloat(data.v),
          quoteVolume: parseFloat(data.q),
          openPrice: parseFloat(data.o),
          lastUpdate: data.E
        };
        onMessage(priceData);
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };
    
    return ws;
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    return null;
  }
}