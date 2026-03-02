// QuentrexKillzone OS - Type Definitions

export type KillzoneType = 'AKZ' | 'LKZ' | 'NYKZ' | 'NONE';

export interface KillzoneConfig {
  name: string;
  type: KillzoneType;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
  color: string;
  active: boolean;
}

export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume?: number;
  trades?: number;
}

export interface PriceData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume: number;
  quoteVolume: number;
  openPrice: number;
  lastUpdate: number;
}

export interface OrderBook {
  lastUpdateId: number;
  bids: { price: number; quantity: number; total: number }[];
  asks: { price: number; quantity: number; total: number }[];
}

export type SignalGrade = 'A+' | 'A' | 'B+' | 'B' | 'C';

export interface Signal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  grade: SignalGrade;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  confidence: number;
  timestamp: number;
  killzone: KillzoneType;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  structure: string;
  orderBlock?: boolean;
  fvg?: boolean;
  liquiditySweep?: boolean;
  mss?: boolean;
  smtDivergence?: boolean;
  rsi?: number;
  macdSignal?: string;
  volumeProfile?: string;
}

export interface TradingSignal extends Signal {
  criteriaScores?: {
    killzoneActive: boolean;
    htfAlignment: boolean;
    mssConfirmed: boolean;
    obFvgConfluence: boolean;
    liquiditySwept: boolean;
    rsiFavorable: boolean;
    macdAlignment: boolean;
    volumeConfirmation: boolean;
  };
  totalScore?: number;
  maxScore?: number;
}

export interface TechnicalIndicators {
  rsi: number;
  rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    crossover?: string;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    position: 'UPPER' | 'MIDDLE' | 'LOWER' | 'OUTSIDE';
    bandwidth: number;
  };
  atr: number;
  ema20: number;
  ema50: number;
  ema200: number;
  volumeProfile: any[];
  supportLevels: number[];
  resistanceLevels: number[];
}

export interface TradeJournal {
  id: string;
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
  riskAmount: number;
  pnl?: number;
  pnlPercent?: number;
  grade: string;
  killzone: KillzoneType;
  entryTime: number;
  exitTime?: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  exitReason?: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'MANUAL';
}