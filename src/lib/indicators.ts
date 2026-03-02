// QuentrexKillzone OS - Technical Indicators

import type { CandleData } from '@/types/trading';

// Calculate RSI
export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate EMA
export function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b) / period;
  
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate SMA
export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b) / period;
}

// Calculate MACD
export function calculateMACD(closes: number[]) {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL' as const };
  }
  
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = ema12 - ema26;
  
  const macdValues: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    macdValues.push(calculateEMA(slice, 12) - calculateEMA(slice, 26));
  }
  
  const signal = calculateEMA(macdValues, 9);
  const histogram = macd - signal;
  
  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (histogram > 0 && macd > signal) trend = 'BULLISH';
  else if (histogram < 0 && macd < signal) trend = 'BEARISH';
  
  return { macd, signal, histogram, trend };
}

// Calculate ATR
export function calculateATR(candles: CandleData[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }
  
  return calculateSMA(trueRanges.slice(-period), period);
}

// Detect MSS (Market Structure Shift)
export function detectMSS(candles: CandleData[]) {
  if (candles.length < 15) return { bullish: false, bearish: false, level: 0, confirmed: false };
  
  const recent = candles.slice(-15);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  
  let swingHigh = 0, swingLow = Infinity;
  
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i-1].high && recent[i].high > recent[i+1].high && recent[i].high > swingHigh) {
      swingHigh = recent[i].high;
    }
    if (recent[i].low < recent[i-1].low && recent[i].low < recent[i+1].low && recent[i].low < swingLow) {
      swingLow = recent[i].low;
    }
  }
  
  const bullish = last.close > swingHigh && prev.close <= swingHigh;
  const bearish = last.close < swingLow && prev.close >= swingLow;
  
  return {
    bullish,
    bearish,
    level: bullish ? swingHigh : bearish ? swingLow : 0,
    confirmed: bullish || bearish
  };
}

// Detect Order Block
export function detectOrderBlock(candles: CandleData[]) {
  if (candles.length < 10) return { bullish: null, bearish: null };
  
  const recent = candles.slice(-30);
  const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
  
  let bullishOB: { price: number; strength: number } | null = null;
  let bearishOB: { price: number; strength: number } | null = null;
  
  for (let i = 1; i < recent.length - 2; i++) {
    const current = recent[i];
    const next = recent[i + 1];
    
    // Bullish OB
    if (current.close < current.open && next.close > next.open) {
      const strength = (next.close - next.open) / (current.open - current.close || 1);
      if (strength > 1.2 && current.volume > avgVolume * 0.8) {
        if (!bullishOB || strength > bullishOB.strength) {
          bullishOB = { price: current.high, strength };
        }
      }
    }
    
    // Bearish OB
    if (current.close > current.open && next.close < next.open) {
      const strength = (next.open - next.close) / (current.close - current.open || 1);
      if (strength > 1.2 && current.volume > avgVolume * 0.8) {
        if (!bearishOB || strength > bearishOB.strength) {
          bearishOB = { price: current.low, strength };
        }
      }
    }
  }
  
  return { bullish: bullishOB, bearish: bearishOB };
}

// Detect FVG (Fair Value Gap)
export function detectFVG(candles: CandleData[]) {
  if (candles.length < 3) return { bullish: null, bearish: null };
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  if (c3.low > c1.high) {
    return { 
      bullish: { high: c3.low, low: c1.high }, 
      bearish: null 
    };
  }
  
  if (c3.high < c1.low) {
    return { 
      bullish: null, 
      bearish: { high: c1.low, low: c3.high } 
    };
  }
  
  return { bullish: null, bearish: null };
}

// Detect Liquidity Sweep
export function detectLiquiditySweep(candles: CandleData[]) {
  if (candles.length < 25) return { bsl: false, ssl: false, level: 0, wickSize: 0 };
  
  const lookback = candles.slice(-25, -1);
  const current = candles[candles.length - 1];
  
  const swingHigh = Math.max(...lookback.map(c => c.high));
  const swingLow = Math.min(...lookback.map(c => c.low));
  
  const bodySize = Math.abs(current.close - current.open);
  const totalRange = current.high - current.low;
  const wickSize = totalRange > 0 ? (totalRange - bodySize) / totalRange : 0;
  
  const bsl = current.high > swingHigh && current.close < swingHigh;
  const ssl = current.low < swingLow && current.close > swingLow;
  
  return {
    bsl,
    ssl,
    level: bsl ? swingHigh : ssl ? swingLow : 0,
    wickSize
  };
}