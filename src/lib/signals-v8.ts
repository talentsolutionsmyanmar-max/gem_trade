// QuentrexKillzone OS v8.0 - OPTIMIZED Signal Generation
// Higher Win Rate Strategy v2.0
// Changes: MTF confirmation, Funding filter, Dynamic sizing, Backtesting support

import type { Signal, CandleData, KillzoneType } from '@/types/trading';
import { getCurrentKillzone } from './killzones';

// ============================================================
// INDICATOR CALCULATIONS (Same as v7.0 - keep working code)
// ============================================================

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  return values.slice(-period).reduce((a, b) => a + b) / period;
}

export function calculateMACD(closes: number[]) {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL' as const, crossover: 'NONE' as const };
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
  
  return { macd, signal, histogram, trend, crossover: 'NONE' as const };
}

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

// ============================================================
// SMC PATTERNS (Keep v7.0 logic - proven)
// ============================================================

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

export function detectFVG(candles: CandleData[]) {
  if (candles.length < 3) return { bullish: null, bearish: null };
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  const avgRange = (c1.high - c1.low + c2.high - c2.low + c3.high - c3.low) / 3;
  
  if (c3.low > c1.high) {
    return { bullish: { high: c3.low, low: c1.high, size: (c3.low - c1.high) / avgRange }, bearish: null };
  }
  if (c3.high < c1.low) {
    return { bullish: null, bearish: { high: c1.low, low: c3.high, size: (c1.low - c3.high) / avgRange } };
  }
  
  return { bullish: null, bearish: null };
}

// ============================================================
// NEW: Multi-Timeframe Analysis
// ============================================================

export interface MTFAnalysis {
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 0-100
  emaAlignment: boolean;
  macdAlignment: boolean;
}

export function analyzeMTF(
  candles15m: CandleData[],
  candles1h?: CandleData[],
  candles4h?: CandleData[]
): MTFAnalysis {
  // Default to 15m analysis if no HTF data
  const closes = candles15m.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const macd = calculateMACD(closes);
  
  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let strength = 0;
  let emaAlignment = false;
  let macdAlignment = false;
  
  // 15m trend
  const bullish15m = ema20 > ema50 && macd.trend === 'BULLISH';
  const bearish15m = ema20 < ema50 && macd.trend === 'BEARISH';
  
  if (bullish15m) {
    trend = 'BULLISH';
    strength += 30;
    emaAlignment = true;
    macdAlignment = macd.trend === 'BULLISH';
  } else if (bearish15m) {
    trend = 'BEARISH';
    strength += 30;
    emaAlignment = true;
    macdAlignment = macd.trend === 'BEARISH';
  }
  
  // If HTF data available, add confirmation
  if (candles1h && candles1h.length > 50) {
    const htfCloses = candles1h.map(c => c.close);
    const htfEma20 = calculateEMA(htfCloses, 20);
    const htfEma50 = calculateEMA(htfCloses, 50);
    
    const htfBullish = htfEma20 > htfEma50;
    const htfBearish = htfEma20 < htfEma50;
    
    // HTF alignment adds strength
    if (trend === 'BULLISH' && htfBullish) {
      strength += 40;
    } else if (trend === 'BEARISH' && htfBearish) {
      strength += 40;
    } else if ((trend === 'BULLISH' && htfBearish) || (trend === 'BEARISH' && htfBullish)) {
      // HTF against us - reduce strength significantly
      strength -= 30;
    }
  }
  
  // 4h adds even more weight
  if (candles4h && candles4h.length > 50) {
    const htf4hCloses = candles4h.map(c => c.close);
    const htf4hEma20 = calculateEMA(htf4hCloses, 20);
    const htf4hEma50 = calculateEMA(htf4hCloses, 50);
    
    if (trend === 'BULLISH' && htf4hEma20 > htf4hEma50) {
      strength += 30;
    } else if (trend === 'BEARISH' && htf4hEma20 < htf4hEma50) {
      strength += 30;
    }
  }
  
  return { trend, strength: Math.min(100, strength), emaAlignment, macdAlignment };
}

// ============================================================
// NEW: Funding Rate Filter
// ============================================================

export function checkFundingFilter(
  fundingRate: number,
  direction: 'LONG' | 'SHORT'
): { allowed: boolean; reason?: string } {
  // Convert to percentage
  const fundingPct = fundingRate * 100;
  
  // Strict funding filter
  if (direction === 'LONG' && fundingPct > 0.05) {
    return { allowed: false, reason: `High long funding: ${fundingPct.toFixed(4)}%` };
  }
  if (direction === 'SHORT' && fundingPct < -0.05) {
    return { allowed: false, reason: `High short funding: ${fundingPct.toFixed(4)}%` };
  }
  
  // Extra favorable if funding is in our favor
  if (direction === 'LONG' && fundingPct < -0.01) {
    return { allowed: true, reason: 'Favorable funding' };
  }
  if (direction === 'SHORT' && fundingPct > 0.01) {
    return { allowed: true, reason: 'Favorable funding' };
  }
  
  return { allowed: true };
}

// ============================================================
// OPTIMIZED: Signal Generation v8.0
// ============================================================

export interface OptimizedSignal extends Signal {
  mtfStrength: number;
  fundingCheck: { allowed: boolean; reason?: string };
  positionSize: number; // 0-1 based on confidence
}

export function generateOptimizedSignal(
  symbol: string,
  candles15m: CandleData[],
  fundingRate: number = 0,
  candles1h?: CandleData[],
  candles4h?: CandleData[]
): OptimizedSignal | null {
  
  if (candles15m.length < 50) return null;
  
  const closes = candles15m.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  const killzone = getCurrentKillzone();
  
  // Calculate indicators
  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const atr = calculateATR(candles15m);
  const mss = detectMSS(candles15m);
  const ob = detectOrderBlock(candles15m);
  const fvg = detectFVG(candles15m);
  
  // NEW: Multi-timeframe analysis
  const mtf = analyzeMTF(candles15m, candles1h, candles4h);
  
  // Volume analysis
  const currentVolume = candles15m[candles15m.length - 1].volume;
  const avgVolume = candles15m.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
  const volumeRatio = currentVolume / avgVolume;
  
  // SCORING SYSTEM v8.0
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];
  
  // 1. Killzone (CRITICAL)
  if (killzone !== 'NONE') {
    bullishScore += 2;
    bearishScore += 2;
    reasons.push(`KZ:${killzone}`);
  }
  
  // 2. MTF Trend Alignment (NEW - HIGH WEIGHT)
  if (mtf.trend === 'BULLISH') {
    bullishScore += 3;
    reasons.push(`MTF:${mtf.strength}%`);
  } else if (mtf.trend === 'BEARISH') {
    bearishScore += 3;
    reasons.push(`MTF:${mtf.strength}%`);
  }
  
  // 3. MSS + Confirmation
  if (mss.bullish && mss.confirmed) {
    bullishScore += 2;
    reasons.push('MSS+');
  }
  if (mss.bearish && mss.confirmed) {
    bearishScore += 2;
    reasons.push('MSS+');
  }
  
  // 4. Order Block
  if (ob.bullish && ob.bullish.strength > 1.2) {
    bullishScore += 1.5;
    reasons.push('OB');
  }
  if (ob.bearish && ob.bearish.strength > 1.2) {
    bearishScore += 1.5;
    reasons.push('OB');
  }
  
  // 5. FVG
  if (fvg.bullish && fvg.bullish.size > 0.3) {
    bullishScore += 1;
    reasons.push('FVG');
  }
  if (fvg.bearish && fvg.bearish.size > 0.3) {
    bearishScore += 1;
    reasons.push('FVG');
  }
  
  // 6. RSI
  if (rsi < 35) { bullishScore += 1; reasons.push('RSI<35'); }
  if (rsi > 65) { bearishScore += 1; reasons.push('RSI>65'); }
  
  // 7. Volume
  if (volumeRatio > 1.3) {
    bullishScore += 1;
    bearishScore += 1;
    reasons.push(`Vol:${volumeRatio.toFixed(1)}x`);
  }
  
  // Determine direction
  let direction: 'LONG' | 'SHORT' | null = null;
  const minScore = 6; // Increased from 5
  const scoreDiff = 2; // Increased from 1.5
  
  if (bullishScore >= minScore && bullishScore > bearishScore + scoreDiff && mtf.trend === 'BULLISH') {
    direction = 'LONG';
  } else if (bearishScore >= minScore && bearishScore > bullishScore + scoreDiff && mtf.trend === 'BEARISH') {
    direction = 'SHORT';
  }
  
  if (!direction || atr === 0) return null;
  
  // NEW: Funding rate check
  const fundingCheck = checkFundingFilter(fundingRate, direction);
  if (!fundingCheck.allowed) {
    return null; // Skip signal if funding is against us
  }
  
  // Calculate levels
  const slDistance = atr * 1.2;
  const entry = currentPrice;
  const stopLoss = direction === 'LONG' ? entry - slDistance : entry + slDistance;
  const takeProfit1 = direction === 'LONG' ? entry + slDistance * 2 : entry - slDistance * 2;
  const takeProfit2 = direction === 'LONG' ? entry + slDistance * 3.5 : entry - slDistance * 3.5;
  const takeProfit3 = direction === 'LONG' ? entry + slDistance * 5 : entry - slDistance * 5;
  
  // Grading
  const criteriaMet = [
    killzone !== 'NONE',
    mtf.strength >= 60,
    mss.confirmed,
    (ob.bullish || ob.bearish) !== null,
    (fvg.bullish || fvg.bearish) !== null,
    direction === 'LONG' ? rsi < 40 : rsi > 60,
    macd.trend === (direction === 'LONG' ? 'BULLISH' : 'BEARISH'),
    volumeRatio > 1.1
  ].filter(Boolean).length;
  
  let grade: 'A+' | 'A' | 'B+' | 'B' | 'C' = 'C';
  if (criteriaMet >= 7 && mtf.strength >= 80) grade = 'A+';
  else if (criteriaMet >= 6 && mtf.strength >= 60) grade = 'A';
  else if (criteriaMet >= 5) grade = 'B+';
  else if (criteriaMet >= 4) grade = 'B';
  
  // Skip lower grades
  if (grade === 'B' || grade === 'C') return null;
  if (grade === 'B+' && killzone === 'NONE') return null;
  
  // NEW: Dynamic position sizing
  const baseSize = 0.02; // 2% base risk
  const mtfMultiplier = mtf.strength / 100;
  const gradeMultiplier = grade === 'A+' ? 1.5 : grade === 'A' ? 1.2 : 1.0;
  const positionSize = Math.min(0.05, baseSize * mtfMultiplier * gradeMultiplier); // Max 5%
  
  const confidence = (criteriaMet / 8) * 100;
  
  return {
    id: `${symbol}-${Date.now()}`,
    symbol,
    direction,
    grade,
    entryPrice: entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    riskReward: 3.5,
    confidence,
    timestamp: Date.now(),
    killzone,
    bias: direction === 'LONG' ? 'BULLISH' : 'BEARISH',
    structure: `${killzone} | ${direction} | MTF:${mtf.strength}% | ${reasons.join(' + ')}`,
    mtfStrength: mtf.strength,
    fundingCheck,
    positionSize
  } as OptimizedSignal;
}

// ============================================================
// NEW: Backtesting Engine
// ============================================================

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIMEOUT';
  entryTime: number;
  exitTime: number;
}

export function runBacktest(
  candles: CandleData[],
  signals: Signal[],
  maxBars: number = 50 // Max bars to hold position
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let totalProfit = 0;
  let totalLoss = 0;
  let maxDrawdown = 0;
  let peak = 0;
  let currentEquity = 10000; // Starting equity
  
  for (const signal of signals) {
    // Find entry candle index
    const entryIndex = candles.findIndex(c => c.openTime >= signal.timestamp);
    if (entryIndex === -1 || entryIndex >= candles.length - 1) continue;
    
    const entryPrice = signal.entryPrice;
    const stopLoss = signal.stopLoss;
    const takeProfit = signal.takeProfit2; // Use TP2 as primary target
    
    let exitPrice = 0;
    let exitReason: BacktestTrade['exitReason'] = 'TIMEOUT';
    let exited = false;
    
    // Simulate price movement
    for (let i = entryIndex + 1; i < Math.min(entryIndex + maxBars, candles.length); i++) {
      const candle = candles[i];
      
      // Check stop loss
      if (signal.direction === 'LONG') {
        if (candle.low <= stopLoss) {
          exitPrice = stopLoss;
          exitReason = 'SL';
          exited = true;
          break;
        }
        if (candle.high >= takeProfit) {
          exitPrice = takeProfit;
          exitReason = 'TP2';
          exited = true;
          break;
        }
      } else {
        if (candle.high >= stopLoss) {
          exitPrice = stopLoss;
          exitReason = 'SL';
          exited = true;
          break;
        }
        if (candle.low <= takeProfit) {
          exitPrice = takeProfit;
          exitReason = 'TP2';
          exited = true;
          break;
        }
      }
    }
    
    if (!exited) {
      // Timeout exit at last candle close
      const lastCandle = candles[Math.min(entryIndex + maxBars - 1, candles.length - 1)];
      exitPrice = lastCandle.close;
      exitReason = 'TIMEOUT';
    }
    
    const pnl = signal.direction === 'LONG' 
      ? exitPrice - entryPrice 
      : entryPrice - exitPrice;
    
    const pnlPercent = (pnl / entryPrice) * 100;
    
    // Update equity for drawdown calculation
    currentEquity *= (1 + pnlPercent / 100);
    if (currentEquity > peak) peak = currentEquity;
    const drawdown = (peak - currentEquity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (pnl > 0) totalProfit += pnl;
    else totalLoss += Math.abs(pnl);
    
    trades.push({
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: entryPrice,
      exit: exitPrice,
      stopLoss,
      takeProfit,
      pnl,
      pnlPercent,
      exitReason,
      entryTime: signal.timestamp,
      exitTime: candles[Math.min(entryIndex + maxBars - 1, candles.length - 1)].closeTime
    });
  }
  
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl < 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const averageWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const averageLoss = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losses.length : 0;
  
  // Sharpe ratio approximation
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
  
  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    averageWin,
    averageLoss,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio,
    trades
  };
}
