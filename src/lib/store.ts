// QuentrexKillzone OS v8.0 - Store with Risk Management Integration
// Powered by Ko Htike + Kimi Claw

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  PriceData, 
  Signal, 
  KillzoneType, 
  KillzoneConfig,
  OrderBook,
  CandleData
} from '@/types/trading';
import type { 
  RiskConfig, 
  TradingLimits, 
  PositionSizeResult,
  PreTradeCheck,
  PerformanceMetrics,
  TradeAlert
} from '@/lib/risk';
import { 
  DEFAULT_RISK_CONFIG,
  checkTradingLimits,
  preTradeCheck,
  calculatePerformanceMetrics,
  generateAlerts
} from '@/lib/risk';

// Trade journal entry
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
  preTradeCheck: PreTradeCheck;
}

interface TradingState {
  // Account
  accountBalance: number;
  startingBalance: number;
  testMode: boolean;
  
  // Risk Management
  riskConfig: RiskConfig;
  tradingLimits: TradingLimits;
  alerts: TradeAlert[];
  
  // Prices
  prices: Record<string, PriceData>;
  selectedPair: string;
  priceHistory: Record<string, number[]>;
  
  // Signals
  signals: Signal[];
  filteredSignals: Signal[];
  signalFilter: {
    grades: string[];
    directions: string[];
    pairs: string[];
  };
  
  // Killzones
  currentKillzone: KillzoneType;
  killzones: KillzoneConfig[];
  mmtTime: Date;
  
  // OrderBook
  orderBook: OrderBook | null;
  
  // Candles
  candles: Record<string, CandleData[]>;
  candles1h: Record<string, CandleData[]>; // HTF data
  selectedTimeframe: string;
  
  // Journal
  trades: TradeJournal[];
  performanceMetrics: PerformanceMetrics;
  
  // UI State
  activeTab: string;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  showRiskWarnings: boolean;
  
  // Actions
  setAccountBalance: (balance: number) => void;
  setTestMode: (mode: boolean) => void;
  updateRiskConfig: (config: Partial<RiskConfig>) => void;
  dismissAlert: (index: number) => void;
  clearAlerts: () => void;
  
  setPrices: (prices: Record<string, PriceData>) => void;
  updatePrice: (symbol: string, data: Partial<PriceData>) => void;
  setSelectedPair: (pair: string) => void;
  
  addSignal: (signal: Signal) => { canAdd: boolean; reason?: string };
  setSignals: (signals: Signal[]) => void;
  setSignalFilter: (filter: Partial<TradingState['signalFilter']>) => void;
  filterSignals: () => void;
  
  setCurrentKillzone: (kz: KillzoneType) => void;
  setMmtTime: (time: Date) => void;
  
  setOrderBook: (ob: OrderBook) => void;
  
  setCandles: (symbol: string, candles: CandleData[], timeframe?: string) => void;
  setSelectedTimeframe: (tf: string) => void;
  
  // Trade execution with risk check
  executeTrade: (signal: Signal, currentPrice: number, fundingRate?: number) => { 
    success: boolean; 
    trade?: TradeJournal; 
    error?: string;
    warnings?: string[];
  };
  closeTrade: (tradeId: string, exitPrice: number, reason: TradeJournal['exitReason']) => void;
  cancelTrade: (tradeId: string) => void;
  updateTrade: (id: string, updates: Partial<TradeJournal>) => void;
  
  setActiveTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: TradingState['connectionStatus']) => void;
  toggleRiskWarnings: () => void;
  
  // Utils
  refreshLimits: () => void;
  exportTradeLog: () => string;
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      // Initial State
      accountBalance: 10000,
      startingBalance: 10000,
      testMode: true,
      
      riskConfig: DEFAULT_RISK_CONFIG,
      tradingLimits: {
        dailyPnL: 0,
        dailyPnLPercent: 0,
        weeklyPnL: 0,
        weeklyPnLPercent: 0,
        openPositions: 0,
        tradesToday: 0,
        tradesThisWeek: 0,
        lastTradeTime: 0,
        canTrade: true
      },
      alerts: [],
      
      prices: {},
      selectedPair: 'BTCUSDT',
      priceHistory: {},
      
      signals: [],
      filteredSignals: [],
      signalFilter: {
        grades: ['A+', 'A', 'B+'],
        directions: ['LONG', 'SHORT'],
        pairs: []
      },
      
      currentKillzone: 'NONE',
      killzones: [
        {
          name: 'Asia Killzone',
          type: 'AKZ',
          startHour: 6,
          startMinute: 30,
          endHour: 10,
          endMinute: 0,
          label: '06:30-10:00 MMT',
          color: '#00ff41',
          active: false
        },
        {
          name: 'London Killzone',
          type: 'LKZ',
          startHour: 13,
          startMinute: 0,
          endHour: 17,
          endMinute: 0,
          label: '13:00-17:00 MMT',
          color: '#00cfff',
          active: false
        },
        {
          name: 'New York Killzone',
          type: 'NYKZ',
          startHour: 18,
          startMinute: 15,
          endHour: 22,
          endMinute: 15,
          label: '18:15-22:15 MMT',
          color: '#bf00ff',
          active: false
        }
      ],
      mmtTime: new Date(),
      
      orderBook: null,
      
      candles: {},
      candles1h: {},
      selectedTimeframe: '15m',
      
      trades: [],
      performanceMetrics: {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        byKillzone: {},
        byGrade: {}
      },
      
      activeTab: 'dashboard',
      isLoading: false,
      error: null,
      connectionStatus: 'disconnected',
      showRiskWarnings: true,
      
      // Account Actions
      setAccountBalance: (balance) => set({ accountBalance: balance }),
      
      setTestMode: (mode) => set({ testMode: mode }),
      
      updateRiskConfig: (config) => set((state) => ({
        riskConfig: { ...state.riskConfig, ...config }
      })),
      
      dismissAlert: (index) => set((state) => ({
        alerts: state.alerts.filter((_, i) => i !== index)
      })),
      
      clearAlerts: () => set({ alerts: [] }),
      
      // Price Actions
      setPrices: (prices) => set({ prices }),
      
      updatePrice: (symbol, data) => set((state) => ({
        prices: {
          ...state.prices,
          [symbol]: { ...state.prices[symbol], ...data } as PriceData
        },
        priceHistory: {
          ...state.priceHistory,
          [symbol]: [...(state.priceHistory[symbol] || []).slice(-99), data.price || state.prices[symbol]?.price]
        }
      })),
      
      setSelectedPair: (pair) => set({ selectedPair: pair }),
      
      // Signal Actions with Risk Check
      addSignal: (signal) => {
        const state = get();
        
        // Check if we can trade
        if (!state.tradingLimits.canTrade) {
          return { 
            canAdd: false, 
            reason: state.tradingLimits.reason || 'Trading not allowed' 
          };
        }
        
        // Check if signal already exists
        const exists = state.signals.find(s => s.id === signal.id);
        if (exists) return { canAdd: false, reason: 'Signal already exists' };
        
        // Add signal
        const newSignals = [signal, ...state.signals].slice(0, 200);
        set({ 
          signals: newSignals,
          filteredSignals: applyFilter(newSignals, state.signalFilter)
        });
        
        // Generate alert for A+ signals
        if (signal.grade === 'A+') {
          set((s) => ({
            alerts: [{
              type: 'SIGNAL' as const,
              priority: 'HIGH' as const,
              title: 'A+ Signal Detected',
              message: `${signal.symbol} ${signal.direction} - ${signal.killzone}`,
              timestamp: Date.now(),
              data: signal
            }, ...s.alerts].slice(0, 50)
          }));
        }
        
        return { canAdd: true };
      },
      
      setSignals: (signals) => set((state) => ({
        signals,
        filteredSignals: applyFilter(signals, state.signalFilter)
      })),
      
      setSignalFilter: (filter) => set((state) => {
        const newFilter = { ...state.signalFilter, ...filter };
        return {
          signalFilter: newFilter,
          filteredSignals: applyFilter(state.signals, newFilter)
        };
      }),
      
      filterSignals: () => {
        const state = get();
        set({ filteredSignals: applyFilter(state.signals, state.signalFilter) });
      },
      
      // Killzone Actions
      setCurrentKillzone: (kz) => set((state) => ({
        currentKillzone: kz,
        killzones: state.killzones.map(k => ({
          ...k,
          active: k.type === kz
        }))
      })),
      
      setMmtTime: (time) => set({ mmtTime: time }),
      
      // OrderBook Actions
      setOrderBook: (ob) => set({ orderBook: ob }),
      
      // Candle Actions
      setCandles: (symbol, candles, timeframe = '15m') => set((state) => {
        if (timeframe === '1h') {
          return {
            candles1h: { ...state.candles1h, [symbol]: candles }
          };
        }
        return {
          candles: { ...state.candles, [symbol]: candles }
        };
      }),
      
      setSelectedTimeframe: (tf) => set({ selectedTimeframe: tf }),
      
      // Trade Execution with Full Risk Check
      executeTrade: (signal, currentPrice, fundingRate = 0) => {
        const state = get();
        
        // Get open positions
        const openPositions = state.trades
          .filter(t => t.status === 'OPEN')
          .map(t => ({ symbol: t.symbol, direction: t.direction }));
        
        // Run pre-trade check
        const check = preTradeCheck(
          signal,
          state.accountBalance,
          currentPrice,
          fundingRate,
          openPositions,
          state.trades.map(t => ({
            ...t,
            pnl: t.pnl || 0,
            pnlPercent: t.pnlPercent || 0,
            exitPrice: t.exitPrice || 0,
            exitTime: t.exitTime || 0,
            riskReward: 0,
            grade: (t.grade || 'A') as 'A+' | 'A' | 'B+' | 'B' | 'C',
            outcome: ((t.pnl || 0) > 0 ? 'WIN' : 'LOSS') as 'WIN' | 'LOSS' | 'BREAKEVEN',
            exitReason: (t.exitReason || 'SL') as 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME',
            criteriaScores: {
              killzoneActive: true,
              htfAlignment: true,
              mssConfirmed: true,
              obFvgConfluence: true,
              liquiditySwept: true,
              rsiFavorable: true,
              macdAlignment: true,
              volumeConfirmation: true
            }
          })),
          state.riskConfig
        );
        
        if (!check.canExecute) {
          // Add risk alert
          set((s) => ({
            alerts: [{
              type: 'RISK' as const,
              priority: 'HIGH' as const,
              title: 'Trade Blocked',
              message: check.errors[0] || 'Risk check failed',
              timestamp: Date.now()
            }, ...s.alerts].slice(0, 50)
          }));
          
          return { 
            success: false, 
            error: check.errors[0],
            warnings: check.warnings 
          };
        }
        
        // Create trade
        const trade: TradeJournal = {
          id: `trade-${Date.now()}`,
          signalId: signal.id,
          symbol: signal.symbol,
          direction: signal.direction,
          entryPrice: currentPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit2,
          size: check.positionSize?.size || 0,
          leverage: check.positionSize?.leverage || 1,
          riskAmount: check.positionSize?.riskAmount || 0,
          grade: signal.grade,
          killzone: signal.killzone,
          entryTime: Date.now(),
          status: 'OPEN',
          preTradeCheck: check
        };
        
        // Add trade
        set((s) => ({
          trades: [trade, ...s.trades],
          alerts: [{
            type: 'TRADE' as const,
            priority: 'MEDIUM' as const,
            title: 'Trade Executed',
            message: `${signal.symbol} ${signal.direction} @ ${currentPrice}`,
            timestamp: Date.now(),
            data: trade
          }, ...s.alerts].slice(0, 50)
        }));
        
        // Refresh limits
        get().refreshLimits();
        
        return { 
          success: true, 
          trade,
          warnings: check.warnings 
        };
      },
      
      closeTrade: (tradeId, exitPrice, reason) => set((state) => {
        const trade = state.trades.find(t => t.id === tradeId);
        if (!trade || trade.status !== 'OPEN') return state;
        
        const pnl = trade.direction === 'LONG' 
          ? (exitPrice - trade.entryPrice) * trade.size
          : (trade.entryPrice - exitPrice) * trade.size;
        
        const pnlPercent = (pnl / state.accountBalance) * 100;
        
        const updatedTrades = state.trades.map(t => 
          t.id === tradeId 
            ? { ...t, exitPrice, exitTime: Date.now(), status: 'CLOSED' as const, pnl, pnlPercent, exitReason: reason }
            : t
        );
        
        // Update balance
        const newBalance = state.accountBalance + pnl;
        
        // Recalculate metrics
        const metrics = calculatePerformanceMetrics(updatedTrades.map(t => ({
          ...t,
          pnl: t.pnl || 0,
          pnlPercent: t.pnlPercent || 0,
          exitPrice: t.exitPrice || 0,
          exitTime: t.exitTime || 0,
          riskReward: 0,
          grade: (t.grade || 'A') as 'A+' | 'A' | 'B+' | 'B' | 'C',
          outcome: ((t.pnl || 0) > 0 ? 'WIN' : 'LOSS') as 'WIN' | 'LOSS' | 'BREAKEVEN',
          exitReason: (t.exitReason || 'SL') as 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME',
          criteriaScores: {
            killzoneActive: true, htfAlignment: true, mssConfirmed: true,
            obFvgConfluence: true, liquiditySwept: true, rsiFavorable: true,
            macdAlignment: true, volumeConfirmation: true
          }
        })));
        
        // Generate performance alert
        const alerts = [...state.alerts];
        if (pnlPercent <= -2) {
          alerts.unshift({
            type: 'RISK' as const,
            priority: 'HIGH' as const,
            title: 'Trade Loss',
            message: `${trade.symbol} stopped out. Loss: ${pnlPercent.toFixed(2)}%`,
            timestamp: Date.now()
          });
        } else if (pnlPercent >= 3) {
          alerts.unshift({
            type: 'PERFORMANCE' as const,
            priority: 'MEDIUM' as const,
            title: 'Trade Win',
            message: `${trade.symbol} hit ${reason}. Profit: ${pnlPercent.toFixed(2)}%`,
            timestamp: Date.now()
          });
        }
        
        return {
          trades: updatedTrades,
          accountBalance: newBalance,
          performanceMetrics: metrics,
          alerts: alerts.slice(0, 50)
        };
      }),
      
      cancelTrade: (tradeId) => set((state) => ({
        trades: state.trades.map(t => 
          t.id === tradeId ? { ...t, status: 'CANCELLED' as const } : t
        )
      })),
      
      updateTrade: (id, updates) => set((state) => ({
        trades: state.trades.map(t => t.id === id ? { ...t, ...updates } : t)
      })),
      
      // UI Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      toggleRiskWarnings: () => set((state) => ({ showRiskWarnings: !state.showRiskWarnings })),
      
      // Utils
      refreshLimits: () => {
        const state = get();
        const limits = checkTradingLimits(
          state.trades.map(t => ({
            ...t,
            pnl: t.pnl || 0,
            pnlPercent: t.pnlPercent || 0,
            exitPrice: t.exitPrice || 0,
            exitTime: t.exitTime || 0,
            riskReward: 0,
            grade: (t.grade || 'A') as 'A+' | 'A' | 'B+' | 'B' | 'C',
            outcome: ((t.pnl || 0) > 0 ? 'WIN' : 'LOSS') as 'WIN' | 'LOSS' | 'BREAKEVEN',
            exitReason: (t.exitReason || 'SL') as 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME',
            criteriaScores: {
              killzoneActive: true, htfAlignment: true, mssConfirmed: true,
              obFvgConfluence: true, liquiditySwept: true, rsiFavorable: true,
              macdAlignment: true, volumeConfirmation: true
            }
          })),
          state.accountBalance,
          state.riskConfig
        );
        set({ tradingLimits: limits });
      },
      
      exportTradeLog: () => {
        const state = get();
        return JSON.stringify({
          exportedAt: Date.now(),
          accountBalance: state.accountBalance,
          startingBalance: state.startingBalance,
          totalReturn: ((state.accountBalance - state.startingBalance) / state.startingBalance) * 100,
          metrics: state.performanceMetrics,
          trades: state.trades
        }, null, 2);
      }
    }),
    {
      name: 'quentrex-storage',
      partialize: (state) => ({
        accountBalance: state.accountBalance,
        startingBalance: state.startingBalance,
        testMode: state.testMode,
        riskConfig: state.riskConfig,
        trades: state.trades,
        signalFilter: state.signalFilter
      })
    }
  )
);

// Helper function to apply signal filter
function applyFilter(signals: Signal[], filter: TradingState['signalFilter']) {
  return signals.filter(signal => {
    if (filter.grades.length > 0 && !filter.grades.includes(signal.grade)) return false;
    if (filter.directions.length > 0 && !filter.directions.includes(signal.direction)) return false;
    if (filter.pairs.length > 0 && !filter.pairs.includes(signal.symbol)) return false;
    return true;
  });
}