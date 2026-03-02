// QuentrexKillzone OS v8.0 - Risk Management System
// Capital Protection First, Profits Second
// Powered by Ko Htike + Kimi Claw

import type { Signal, BacktestTrade } from '@/types/trading';

// ============================================================
// RISK CONFIGURATION
// ============================================================

export interface RiskConfig {
  maxRiskPerTrade: number;      // 2% default
  maxDailyLoss: number;         // 3% default  
  maxWeeklyLoss: number;        // 8% default
  maxPositions: number;         // 5 open positions max
  maxCorrelation: number;       // Max 3 correlated pairs
  minWinRate: number;           // Stop if below 45%
  killzoneOnly: boolean;        // Only trade during killzones
  fundingFilter: boolean;       // Skip unfavorable funding
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTrade: 0.02,        // 2%
  maxDailyLoss: 0.03,           // 3%
  maxWeeklyLoss: 0.08,          // 8%
  maxPositions: 5,
  maxCorrelation: 3,
  minWinRate: 0.45,             // 45%
  killzoneOnly: true,
  fundingFilter: true
};

// ============================================================
// POSITION SIZING
// ============================================================

export interface PositionSizeResult {
  size: number;                 // Position size in quote currency
  riskAmount: number;           // Risk in USDT
  leverage: number;             // Suggested leverage
  invalidReason?: string;       // Why sizing failed
}

export function calculatePositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLoss: number,
  signal: Signal,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PositionSizeResult {
  // Check signal grade for position sizing
  const gradeMultiplier = {
    'A+': 1.5,    // 3% risk
    'A': 1.0,     // 2% risk  
    'B+': 0.5,    // 1% risk
    'B': 0,       // Skip
    'C': 0        // Skip
  }[signal.grade] || 0;
  
  if (gradeMultiplier === 0) {
    return {
      size: 0,
      riskAmount: 0,
      leverage: 0,
      invalidReason: `Grade ${signal.grade} below threshold`
    };
  }
  
  // Calculate risk
  const riskPercent = config.maxRiskPerTrade * gradeMultiplier;
  const riskAmount = accountBalance * riskPercent;
  
  // Calculate price distance to stop
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopDistancePercent = stopDistance / entryPrice;
  
  if (stopDistancePercent === 0) {
    return {
      size: 0,
      riskAmount: 0,
      leverage: 0,
      invalidReason: 'Invalid stop loss (zero distance)'
    };
  }
  
  // Position size = Risk Amount / Stop Distance
  const positionSize = riskAmount / stopDistancePercent;
  
  // Calculate leverage (capped at 10x for safety)
  const rawLeverage = positionSize / accountBalance;
  const leverage = Math.min(10, Math.max(1, Math.ceil(rawLeverage)));
  
  return {
    size: positionSize,
    riskAmount,
    leverage
  };
}

// ============================================================
// FUNDING RATE FILTER
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
// DAILY/WEEKLY LIMITS
// ============================================================

export interface TradingLimits {
  dailyPnL: number;
  dailyPnLPercent: number;
  weeklyPnL: number;
  weeklyPnLPercent: number;
  openPositions: number;
  tradesToday: number;
  tradesThisWeek: number;
  lastTradeTime: number;
  canTrade: boolean;
  reason?: string;
}

export function checkTradingLimits(
  trades: BacktestTrade[],
  accountBalance: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): TradingLimits {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  // Calculate daily P&L
  const todayTrades = trades.filter(t => t.exitTime > dayAgo);
  const dailyPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
  const dailyPnLPercent = (dailyPnL / accountBalance) * 100;
  
  // Calculate weekly P&L
  const weekTrades = trades.filter(t => t.exitTime > weekAgo);
  const weeklyPnL = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
  const weeklyPnLPercent = (weeklyPnL / accountBalance) * 100;
  
  // Count open positions (trades without exit in last 24h)
  const openPositions = trades.filter(t => !t.exitTime || t.exitTime > now - 1000).length;
  
  // Check limits
  let canTrade = true;
  let reason: string | undefined;
  
  if (dailyPnLPercent <= -config.maxDailyLoss * 100) {
    canTrade = false;
    reason = `Daily loss limit reached: ${dailyPnLPercent.toFixed(2)}%`;
  } else if (weeklyPnLPercent <= -config.maxWeeklyLoss * 100) {
    canTrade = false;
    reason = `Weekly loss limit reached: ${weeklyPnLPercent.toFixed(2)}%`;
  } else if (openPositions >= config.maxPositions) {
    canTrade = false;
    reason = `Max positions reached: ${openPositions}/${config.maxPositions}`;
  }
  
  return {
    dailyPnL,
    dailyPnLPercent,
    weeklyPnL,
    weeklyPnLPercent,
    openPositions,
    tradesToday: todayTrades.length,
    tradesThisWeek: weekTrades.length,
    lastTradeTime: trades.length > 0 ? trades[trades.length - 1].entryTime : 0,
    canTrade,
    reason
  };
}

// ============================================================
// CORRELATION CHECK
// ============================================================

// Crypto correlation groups
const CORRELATION_GROUPS = {
  majors: ['BTCUSDT', 'ETHUSDT'],
  solana: ['SOLUSDT'],
  alts: ['BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT'],
  memes: ['DOGEUSDT'],
  defi: ['LINKUSDT', 'UNIUSDT', 'AVAXUSDT'],
  layer1: ['NEARUSDT', 'APTUSDT', 'ATOMUSDT'],
  legacy: ['LTCUSDT', 'ETCUSDT'],
  ai: ['FETUSDT']
};

export function checkCorrelation(
  newSymbol: string,
  openPositions: { symbol: string; direction: 'LONG' | 'SHORT' }[],
  maxCorrelation: number = 3
): { allowed: boolean; reason?: string } {
  // Find which group the new symbol belongs to
  let newGroup: string | null = null;
  for (const [group, symbols] of Object.entries(CORRELATION_GROUPS)) {
    if (symbols.includes(newSymbol)) {
      newGroup = group;
      break;
    }
  }
  
  if (!newGroup) return { allowed: true }; // Unknown symbol, allow
  
  // Count positions in same group with same direction
  const sameGroupCount = openPositions.filter(pos => {
    const groupSymbols = CORRELATION_GROUPS[newGroup as keyof typeof CORRELATION_GROUPS] || [];
    return groupSymbols.includes(pos.symbol);
  }).length;
  
  if (sameGroupCount >= maxCorrelation) {
    return {
      allowed: false,
      reason: `Max correlation reached in ${newGroup} group (${sameGroupCount}/${maxCorrelation})`
    };
  }
  
  return { allowed: true };
}

// ============================================================
// SIGNAL VALIDATION
// ============================================================

export interface SignalValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSignal(
  signal: Signal,
  currentPrice: number,
  fundingRate: number = 0,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): SignalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Grade check
  if (signal.grade === 'B' || signal.grade === 'C') {
    errors.push(`Grade ${signal.grade} below minimum threshold`);
  }
  
  // Killzone check
  if (config.killzoneOnly && signal.killzone === 'NONE') {
    errors.push('Outside killzone hours');
  }
  
  // Funding check
  if (config.fundingFilter) {
    const fundingPct = fundingRate * 100;
    if (signal.direction === 'LONG' && fundingPct > 0.05) {
      errors.push(`Unfavorable funding: ${fundingPct.toFixed(4)}%`);
    }
    if (signal.direction === 'SHORT' && fundingPct < -0.05) {
      errors.push(`Unfavorable funding: ${fundingPct.toFixed(4)}%`);
    }
  }
  
  // Price freshness (signal older than 5 minutes)
  const signalAge = Date.now() - signal.timestamp;
  if (signalAge > 5 * 60 * 1000) {
    warnings.push(`Signal is ${Math.floor(signalAge / 1000 / 60)} minutes old`);
  }
  
  // Price drift (current price far from entry)
  const priceDrift = Math.abs(currentPrice - signal.entryPrice) / signal.entryPrice;
  if (priceDrift > 0.005) { // 0.5% drift
    warnings.push(`Price drifted ${(priceDrift * 100).toFixed(2)}% from signal`);
  }
  
  // Risk:Reward check
  if (signal.riskReward < 2) {
    warnings.push(`Low R:R ratio: ${signal.riskReward}:1`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================
// PRE-TRADE CHECKLIST
// ============================================================

export interface PreTradeCheck {
  canExecute: boolean;
  positionSize?: PositionSizeResult;
  limits?: TradingLimits;
  correlation?: { allowed: boolean; reason?: string };
  validation?: SignalValidation;
  errors: string[];
  warnings: string[];
}

export function preTradeCheck(
  signal: Signal,
  accountBalance: number,
  currentPrice: number,
  fundingRate: number,
  openPositions: { symbol: string; direction: 'LONG' | 'SHORT' }[],
  tradeHistory: BacktestTrade[],
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PreTradeCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check trading limits
  const limits = checkTradingLimits(tradeHistory, accountBalance, config);
  if (!limits.canTrade) {
    errors.push(limits.reason || 'Trading not allowed');
    return { canExecute: false, limits, errors, warnings };
  }
  
  // 2. Validate signal
  const validation = validateSignal(signal, currentPrice, fundingRate, config);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }
  warnings.push(...validation.warnings);
  
  // 3. Check correlation
  const correlation = checkCorrelation(signal.symbol, openPositions, config.maxCorrelation);
  if (!correlation.allowed) {
    errors.push(correlation.reason || 'Correlation limit reached');
  }
  
  // 4. Calculate position size
  const positionSize = calculatePositionSize(
    accountBalance,
    signal.entryPrice,
    signal.stopLoss,
    signal,
    config
  );
  
  if (positionSize.invalidReason) {
    errors.push(positionSize.invalidReason);
  }
  
  const canExecute = errors.length === 0;
  
  return {
    canExecute,
    positionSize: canExecute ? positionSize : undefined,
    limits,
    correlation,
    validation,
    errors,
    warnings
  };
}

// ============================================================
// PERFORMANCE TRACKING
// ============================================================

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  byKillzone: Record<string, { trades: number; winRate: number; pnl: number }>;
  byGrade: Record<string, { trades: number; winRate: number; pnl: number }>;
}

export function calculatePerformanceMetrics(trades: BacktestTrade[]): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      byKillzone: {},
      byGrade: {}
    };
  }
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  
  const winRate = (wins.length / trades.length) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  
  for (const trade of trades) {
    runningPnl += trade.pnl;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Sharpe ratio
  const returns = trades.map(t => t.pnl);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
  
  // By killzone
  const byKillzone: Record<string, { trades: number; winRate: number; pnl: number }> = {};
  for (const kz of ['AKZ', 'LKZ', 'NYKZ', 'NONE'] as const) {
    const kzTrades = trades.filter(t => t.killzone === kz);
    if (kzTrades.length > 0) {
      const kzWins = kzTrades.filter(t => t.pnl > 0).length;
      byKillzone[kz] = {
        trades: kzTrades.length,
        winRate: (kzWins / kzTrades.length) * 100,
        pnl: kzTrades.reduce((s, t) => s + t.pnl, 0)
      };
    }
  }
  
  // By grade
  const byGrade: Record<string, { trades: number; winRate: number; pnl: number }> = {};
  for (const grade of ['A+', 'A', 'B+', 'B', 'C'] as const) {
    const gradeTrades = trades.filter(t => t.grade === grade);
    if (gradeTrades.length > 0) {
      const gradeWins = gradeTrades.filter(t => t.pnl > 0).length;
      byGrade[grade] = {
        trades: gradeTrades.length,
        winRate: (gradeWins / gradeTrades.length) * 100,
        pnl: gradeTrades.reduce((s, t) => s + t.pnl, 0)
      };
    }
  }
  
  return {
    totalTrades: trades.length,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    maxDrawdown,
    sharpeRatio,
    byKillzone,
    byGrade
  };
}

// ============================================================
// ALERTS & NOTIFICATIONS
// ============================================================

export interface TradeAlert {
  type: 'SIGNAL' | 'TRADE' | 'RISK' | 'PERFORMANCE' | 'ERROR';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

export function generateAlerts(
  limits: TradingLimits,
  metrics: PerformanceMetrics,
  newSignal?: Signal
): TradeAlert[] {
  const alerts: TradeAlert[] = [];
  
  // Risk alerts
  if (limits.dailyPnLPercent <= -2) {
    alerts.push({
      type: 'RISK',
      priority: 'HIGH',
      title: 'Daily Loss Warning',
      message: `Daily P&L: ${limits.dailyPnLPercent.toFixed(2)}%. Approaching limit.`,
      timestamp: Date.now()
    });
  }
  
  if (limits.dailyPnLPercent <= -3) {
    alerts.push({
      type: 'RISK',
      priority: 'CRITICAL',
      title: 'Daily Loss Limit Reached',
      message: `Trading halted. Daily loss: ${limits.dailyPnLPercent.toFixed(2)}%`,
      timestamp: Date.now()
    });
  }
  
  // Performance alerts
  if (metrics.winRate < 45 && metrics.totalTrades > 20) {
    alerts.push({
      type: 'PERFORMANCE',
      priority: 'HIGH',
      title: 'Low Win Rate Alert',
      message: `Win rate dropped to ${metrics.winRate.toFixed(1)}%. Review strategy.`,
      timestamp: Date.now()
    });
  }
  
  if (metrics.maxDrawdown > 10) {
    alerts.push({
      type: 'RISK',
      priority: 'CRITICAL',
      title: 'High Drawdown',
      message: `Max drawdown: ${metrics.maxDrawdown.toFixed(2)}%. Reduce position sizes.`,
      timestamp: Date.now()
    });
  }
  
  // Signal alerts
  if (newSignal?.grade === 'A+') {
    alerts.push({
      type: 'SIGNAL',
      priority: 'HIGH',
      title: 'A+ Signal Detected',
      message: `${newSignal.symbol} ${newSignal.direction} - ${newSignal.killzone}`,
      timestamp: Date.now(),
      data: newSignal
    });
  }
  
  return alerts;
}