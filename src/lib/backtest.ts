// QuentrexKillzone OS v7.0 - Backtesting Engine
// Powered by Ko Htike

import type { CandleData, KillzoneType, Signal } from '@/types/trading';
import { calculateRSI, calculateEMA, calculateATR, detectMSS, detectOrderBlock, detectFVG, detectLiquiditySweep } from './indicators';

// Backtesting pairs - Top 10 by volume
export const BACKTEST_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT'
];

// Killzone time ranges in MMT minutes from midnight
const KILLZONES = {
  AKZ: { start: 6 * 60 + 30, end: 10 * 60 },      // 06:30 - 10:00
  LKZ: { start: 13 * 60, end: 17 * 60 },          // 13:00 - 17:00
  NYKZ: { start: 18 * 60 + 15, end: 22 * 60 + 15 } // 18:15 - 22:15
};

// Backtest trade result
export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  pnlPercent: number;
  riskReward: number;
  killzone: KillzoneType;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME';
  criteriaScores: {
    killzoneActive: boolean;
    htfAlignment: boolean;
    mssConfirmed: boolean;
    obFvgConfluence: boolean;
    liquiditySwept: boolean;
    rsiFavorable: boolean;
    macdAlignment: boolean;
    volumeConfirmation: boolean;
  };
}

// Backtest results summary
export interface BacktestResults {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  
  // By grade
  byGrade: {
    [key in 'A+' | 'A' | 'B+']?: {
      trades: number;
      wins: number;
      winRate: number;
      pnl: number;
      avgRR: number;
    };
  };
  
  // By killzone
  byKillzone: {
    [key in KillzoneType]?: {
      trades: number;
      wins: number;
      winRate: number;
      pnl: number;
    };
  };
  
  trades: BacktestTrade[];
}

// All results
export interface BacktestSummary {
  overall: BacktestResults;
  byPair: BacktestResults[];
  generatedAt: number;
  period: {
    start: number;
    end: number;
    days: number;
  };
}

// Get killzone from timestamp (MMT)
function getKillzoneFromTime(timestamp: number): KillzoneType {
  const date = new Date(timestamp);
  // Convert to MMT (UTC+6:30)
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const mmtDate = new Date(utcMs + 6.5 * 3600000);
  const mmtMinutes = mmtDate.getHours() * 60 + mmtDate.getMinutes();
  
  for (const [kz, range] of Object.entries(KILLZONES)) {
    if (mmtMinutes >= range.start && mmtMinutes < range.end) {
      return kz as KillzoneType;
    }
  }
  return 'NONE';
}

// Run backtest for a single pair
export async function runBacktestForPair(
  symbol: string,
  days: number = 30
): Promise<BacktestResults> {
  // Fetch historical candles
  const limit = Math.min(1000, days * 24 * 4); // 15m candles
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch candles for ${symbol}`);
  }
  
  const rawData = await response.json();
  
  const candles: CandleData[] = rawData.map((item: any) => ({
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
  
  // Run strategy on each candle
  const trades: BacktestTrade[] = [];
  
  for (let i = 50; i < candles.length - 20; i++) {
    const historicalCandles = candles.slice(0, i + 1);
    const currentCandle = candles[i];
    const futureCandles = candles.slice(i + 1, i + 21);
    
    // Get killzone
    const killzone = getKillzoneFromTime(currentCandle.openTime);
    if (killzone === 'NONE') continue; // Only trade during killzones
    
    // Calculate indicators
    const closes = historicalCandles.map(c => c.close);
    const rsi = calculateRSI(closes);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const atr = calculateATR(historicalCandles);
    
    // Detect patterns
    const mss = detectMSS(historicalCandles);
    const ob = detectOrderBlock(historicalCandles);
    const fvg = detectFVG(historicalCandles);
    const liqSweep = detectLiquiditySweep(historicalCandles);
    
    // Determine direction and score
    let direction: 'LONG' | 'SHORT' | null = null;
    let bullishScore = 0;
    let bearishScore = 0;
    
    // Score calculation
    if (mss.bullish) bullishScore += 2;
    if (mss.bearish) bearishScore += 2;
    if (ob.bullish) bullishScore += 1;
    if (ob.bearish) bearishScore += 1;
    if (fvg.bullish) bullishScore += 1;
    if (fvg.bearish) bearishScore += 1;
    if (liqSweep.ssl) bullishScore += 1;
    if (liqSweep.bsl) bearishScore += 1;
    if (rsi < 45) bullishScore += 1;
    if (rsi > 55) bearishScore += 1;
    if (currentCandle.close > ema20) bullishScore += 1;
    if (currentCandle.close < ema20) bearishScore += 1;
    
    // Determine direction
    if (bullishScore >= 4 && bullishScore > bearishScore) {
      direction = 'LONG';
    } else if (bearishScore >= 4 && bearishScore > bullishScore) {
      direction = 'SHORT';
    }
    
    if (!direction || atr === 0) continue;
    
    // Calculate entry, SL, TP
    const entry = currentCandle.close;
    const slDistance = atr * 1.5;
    const stopLoss = direction === 'LONG' ? entry - slDistance : entry + slDistance;
    const tp1 = direction === 'LONG' ? entry + slDistance * 2 : entry - slDistance * 2;
    const tp2 = direction === 'LONG' ? entry + slDistance * 3 : entry - slDistance * 3;
    const tp3 = direction === 'LONG' ? entry + slDistance * 5 : entry - slDistance * 5;
    
    // Calculate grade
    const criteriaScores = {
      killzoneActive: true, // Already filtered above (killzone !== 'NONE')
      htfAlignment: ema20 > ema50 ? direction === 'LONG' : direction === 'SHORT',
      mssConfirmed: direction === 'LONG' ? mss.bullish : mss.bearish,
      obFvgConfluence: direction === 'LONG' ? !!(ob.bullish || fvg.bullish) : !!(ob.bearish || fvg.bearish),
      liquiditySwept: direction === 'LONG' ? liqSweep.ssl : liqSweep.bsl,
      rsiFavorable: direction === 'LONG' ? rsi < 45 : rsi > 55,
      macdAlignment: true, // Simplified
      volumeConfirmation: currentCandle.volume > historicalCandles[i - 1]?.volume
    };
    
    const totalScore = Object.values(criteriaScores).filter(Boolean).length;
    
    let grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
    if (totalScore >= 8) grade = 'A+';
    else if (totalScore >= 6) grade = 'A';
    else if (totalScore >= 4) grade = 'B+';
    else if (totalScore >= 3) grade = 'B';
    else grade = 'C';
    
    // Skip low quality signals
    if (grade === 'B' || grade === 'C') continue;
    
    // Simulate trade outcome
    let outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'LOSS';
    let exitPrice = stopLoss;
    let exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME' = 'SL';
    let exitTime = futureCandles[futureCandles.length - 1]?.closeTime || currentCandle.closeTime;
    
    for (const futureCandle of futureCandles) {
      if (direction === 'LONG') {
        // Check if hit SL
        if (futureCandle.low <= stopLoss) {
          exitPrice = stopLoss;
          outcome = 'LOSS';
          exitReason = 'SL';
          exitTime = futureCandle.openTime;
          break;
        }
        // Check if hit TP1
        if (futureCandle.high >= tp1 && outcome === 'LOSS') {
          exitPrice = tp1;
          outcome = 'WIN';
          exitReason = 'TP1';
          exitTime = futureCandle.openTime;
          // Don't break - check if we can hit TP2
        }
        // Check if hit TP2
        if (futureCandle.high >= tp2 && exitReason === 'TP1') {
          exitPrice = tp2;
          exitReason = 'TP2';
        }
        // Check if hit TP3
        if (futureCandle.high >= tp3 && exitReason === 'TP2') {
          exitPrice = tp3;
          exitReason = 'TP3';
          break;
        }
      } else {
        // SHORT
        if (futureCandle.high >= stopLoss) {
          exitPrice = stopLoss;
          outcome = 'LOSS';
          exitReason = 'SL';
          exitTime = futureCandle.openTime;
          break;
        }
        if (futureCandle.low <= tp1 && outcome === 'LOSS') {
          exitPrice = tp1;
          outcome = 'WIN';
          exitReason = 'TP1';
          exitTime = futureCandle.openTime;
        }
        if (futureCandle.low <= tp2 && exitReason === 'TP1') {
          exitPrice = tp2;
          exitReason = 'TP2';
        }
        if (futureCandle.low <= tp3 && exitReason === 'TP2') {
          exitPrice = tp3;
          exitReason = 'TP3';
          break;
        }
      }
    }
    
    // Calculate PnL (assuming 1% risk per trade)
    const riskPercent = 1;
    const pnlPercent = outcome === 'WIN' 
      ? riskPercent * (exitReason === 'TP1' ? 2 : exitReason === 'TP2' ? 3 : exitReason === 'TP3' ? 5 : 2)
      : -riskPercent;
    
    const trade: BacktestTrade = {
      id: `${symbol}-${currentCandle.openTime}`,
      symbol,
      direction,
      grade,
      entryPrice: entry,
      exitPrice,
      stopLoss,
      takeProfit: exitReason === 'TP1' ? tp1 : exitReason === 'TP2' ? tp2 : tp3,
      entryTime: currentCandle.openTime,
      exitTime,
      pnl: pnlPercent,
      pnlPercent,
      riskReward: exitReason === 'TP1' ? 2 : exitReason === 'TP2' ? 3 : exitReason === 'TP3' ? 5 : 0,
      killzone,
      outcome,
      exitReason,
      criteriaScores
    };
    
    trades.push(trade);
  }
  
  // Calculate results
  const wins = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgWin = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / wins || 0;
  const avgLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losses) || 0;
  
  // By grade
  const byGrade: BacktestResults['byGrade'] = {};
  for (const grade of ['A+', 'A', 'B+'] as const) {
    const gradeTrades = trades.filter(t => t.grade === grade);
    if (gradeTrades.length > 0) {
      byGrade[grade] = {
        trades: gradeTrades.length,
        wins: gradeTrades.filter(t => t.outcome === 'WIN').length,
        winRate: (gradeTrades.filter(t => t.outcome === 'WIN').length / gradeTrades.length) * 100,
        pnl: gradeTrades.reduce((sum, t) => sum + t.pnl, 0),
        avgRR: gradeTrades.reduce((sum, t) => sum + t.riskReward, 0) / gradeTrades.length
      };
    }
  }
  
  // By killzone
  const byKillzone: BacktestResults['byKillzone'] = {};
  for (const kz of ['AKZ', 'LKZ', 'NYKZ'] as KillzoneType[]) {
    const kzTrades = trades.filter(t => t.killzone === kz);
    if (kzTrades.length > 0) {
      byKillzone[kz] = {
        trades: kzTrades.length,
        wins: kzTrades.filter(t => t.outcome === 'WIN').length,
        winRate: (kzTrades.filter(t => t.outcome === 'WIN').length / kzTrades.length) * 100,
        pnl: kzTrades.reduce((sum, t) => sum + t.pnl, 0)
      };
    }
  }
  
  return {
    symbol,
    totalTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    totalPnlPercent: totalPnl,
    avgWin,
    avgLoss,
    profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
    maxDrawdown: calculateMaxDrawdown(trades),
    sharpeRatio: calculateSharpeRatio(trades),
    byGrade,
    byKillzone,
    trades
  };
}

// Calculate max drawdown
function calculateMaxDrawdown(trades: BacktestTrade[]): number {
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  
  for (const trade of trades) {
    runningPnl += trade.pnl;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return maxDrawdown;
}

// Calculate Sharpe ratio (simplified)
function calculateSharpeRatio(trades: BacktestTrade[]): number {
  if (trades.length < 2) return 0;
  
  const returns = trades.map(t => t.pnl);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
}

// Run full backtest
export async function runFullBacktest(days: number = 30): Promise<BacktestSummary> {
  const byPair: BacktestResults[] = [];
  
  for (const symbol of BACKTEST_PAIRS) {
    try {
      console.log(`Backtesting ${symbol}...`);
      const results = await runBacktestForPair(symbol, days);
      byPair.push(results);
    } catch (error) {
      console.error(`Error backtesting ${symbol}:`, error);
    }
  }
  
  // Calculate overall
  const allTrades = byPair.flatMap(r => r.trades);
  const wins = allTrades.filter(t => t.outcome === 'WIN').length;
  const totalTrades = allTrades.length;
  
  const overall: BacktestResults = {
    symbol: 'ALL',
    totalTrades,
    wins,
    losses: totalTrades - wins,
    winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    totalPnl: allTrades.reduce((sum, t) => sum + t.pnl, 0),
    totalPnlPercent: allTrades.reduce((sum, t) => sum + t.pnl, 0),
    avgWin: byPair.reduce((sum, r) => sum + r.avgWin * r.wins, 0) / wins || 0,
    avgLoss: Math.abs(byPair.reduce((sum, r) => sum + r.avgLoss * r.losses, 0) / (totalTrades - wins)) || 0,
    profitFactor: 0,
    maxDrawdown: Math.max(...byPair.map(r => r.maxDrawdown)),
    sharpeRatio: byPair.reduce((sum, r) => sum + r.sharpeRatio, 0) / byPair.length,
    byGrade: mergeByGrade(byPair),
    byKillzone: mergeByKillzone(byPair),
    trades: allTrades
  };
  
  overall.profitFactor = overall.avgLoss > 0 ? overall.avgWin / overall.avgLoss : 0;
  
  return {
    overall,
    byPair,
    generatedAt: Date.now(),
    period: {
      start: Date.now() - days * 24 * 60 * 60 * 1000,
      end: Date.now(),
      days
    }
  };
}

function mergeByGrade(results: BacktestResults[]): BacktestResults['byGrade'] {
  const merged: BacktestResults['byGrade'] = {};
  
  for (const grade of ['A+', 'A', 'B+'] as const) {
    const gradeResults = results.filter(r => r.byGrade[grade]);
    if (gradeResults.length > 0) {
      const trades = gradeResults.reduce((sum, r) => sum + (r.byGrade[grade]?.trades || 0), 0);
      const wins = gradeResults.reduce((sum, r) => sum + (r.byGrade[grade]?.wins || 0), 0);
      const pnl = gradeResults.reduce((sum, r) => sum + (r.byGrade[grade]?.pnl || 0), 0);
      
      merged[grade] = {
        trades,
        wins,
        winRate: trades > 0 ? (wins / trades) * 100 : 0,
        pnl,
        avgRR: gradeResults.reduce((sum, r) => sum + (r.byGrade[grade]?.avgRR || 0), 0) / gradeResults.length
      };
    }
  }
  
  return merged;
}

function mergeByKillzone(results: BacktestResults[]): BacktestResults['byKillzone'] {
  const merged: BacktestResults['byKillzone'] = {};
  
  for (const kz of ['AKZ', 'LKZ', 'NYKZ', 'NONE'] as KillzoneType[]) {
    const kzResults = results.filter(r => r.byKillzone[kz]);
    if (kzResults.length > 0) {
      const trades = kzResults.reduce((sum, r) => sum + (r.byKillzone[kz]?.trades || 0), 0);
      const wins = kzResults.reduce((sum, r) => sum + (r.byKillzone[kz]?.wins || 0), 0);
      const pnl = kzResults.reduce((sum, r) => sum + (r.byKillzone[kz]?.pnl || 0), 0);
      
      merged[kz] = {
        trades,
        wins,
        winRate: trades > 0 ? (wins / trades) * 100 : 0,
        pnl
      };
    }
  }
  
  return merged;
}