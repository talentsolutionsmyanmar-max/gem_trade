// QuentrexKillzone OS v8.0 - Signals API with Risk Management
// Integrated risk checks on every signal
// Powered by Ko Htike + Kimi Claw

import { NextResponse } from 'next/server';
import { TRADING_PAIRS } from '@/lib/binance';
import { generateOptimizedSignal, type OptimizedSignal } from '@/lib/signals-v8';
import { getCurrentKillzone } from '@/lib/killzones';
import { checkFundingFilter } from '@/lib/risk';
import type { CandleData } from '@/types/trading';

const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

// Cache for candlestick data
const candleCache = new Map<string, { 
  data15m: CandleData[]; 
  data1h: CandleData[];
  timestamp: number;
}>();
const CACHE_TTL = 30000; // 30 seconds - shorter for live trading

interface FundingCache {
  rates: Record<string, number>;
  timestamp: number;
}

let fundingCache: FundingCache | null = null;
const FUNDING_CACHE_TTL = 60000; // 1 minute

async function fetchKlines(symbol: string, interval: string, limit: number = 200): Promise<CandleData[]> {
  const response = await fetch(
    `${BINANCE_FUTURES_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${interval} klines for ${symbol}`);
  }
  
  const data = await response.json();
  
  return data.map((k: any) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8]
  }));
}

async function fetchFundingRate(symbol: string): Promise<number> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_API}/fundingRate?symbol=${symbol}&limit=1`
    );
    if (!response.ok) return 0;
    
    const data = await response.json();
    return parseFloat(data[0]?.fundingRate || '0');
  } catch {
    return 0;
  }
}

async function fetchAllFundingRates(): Promise<Record<string, number>> {
  // Use cache if fresh
  if (fundingCache && Date.now() - fundingCache.timestamp < FUNDING_CACHE_TTL) {
    return fundingCache.rates;
  }
  
  try {
    const response = await fetch(`${BINANCE_FUTURES_API}/fundingRate?limit=1000`);
    if (!response.ok) return {};
    
    const data = await response.json();
    const rates: Record<string, number> = {};
    
    data.forEach((item: any) => {
      if (!rates[item.symbol] && TRADING_PAIRS.includes(item.symbol)) {
        rates[item.symbol] = parseFloat(item.fundingRate);
      }
    });
    
    fundingCache = { rates, timestamp: Date.now() };
    return rates;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'all';
  const pairs = searchParams.get('pairs')?.split(',') || TRADING_PAIRS;
  const grades = searchParams.get('grades')?.split(',') as ('A+' | 'A' | 'B+')[] | undefined;
  
  try {
    const activeKillzone = getCurrentKillzone();
    const allSignals: OptimizedSignal[] = [];
    const rejectedSignals: { symbol: string; reason: string }[] = [];
    
    // Fetch funding rates once for all pairs
    const fundingRates = await fetchAllFundingRates();
    
    // Process all pairs concurrently with rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (symbol) => {
        try {
          // Check cache
          const cached = candleCache.get(symbol);
          let klines15m: CandleData[];
          let klines1h: CandleData[];
          
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            klines15m = cached.data15m;
            klines1h = cached.data1h;
          } else {
            // Fetch both timeframes
            const [data15m, data1h] = await Promise.all([
              fetchKlines(symbol, '15m', 200),
              fetchKlines(symbol, '1h', 100)
            ]);
            
            klines15m = data15m;
            klines1h = data1h;
            
            // Update cache
            candleCache.set(symbol, {
              data15m: klines15m,
              data1h: klines1h,
              timestamp: Date.now()
            });
          }
          
          // Generate signal with HTF data
          const signal = generateOptimizedSignal(
            symbol,
            klines15m,
            fundingRates[symbol] || 0,
            klines1h,
            undefined // 4h optional
          );
          
          if (!signal) {
            return { signal: null, rejected: null };
          }
          
          // Check funding filter
          const fundingCheck = checkFundingFilter(fundingRates[symbol] || 0, signal.direction);
          if (!fundingCheck.allowed) {
            return {
              signal: null,
              rejected: { symbol, reason: fundingCheck.reason || 'Funding filter' }
            };
          }
          
          return { signal, rejected: null };
          
        } catch (error) {
          console.error(`Error processing ${symbol}:`, error);
          return { signal: null, rejected: { symbol, reason: 'Processing error' } };
        }
      });
      
      const results = await Promise.all(batchPromises);
      
      for (const result of results) {
        if (result.signal) {
          allSignals.push(result.signal);
        } else if (result.rejected) {
          rejectedSignals.push(result.rejected);
        }
      }
      
      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < pairs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Sort by grade and confidence
    const gradeOrder: Record<string, number> = {
      'A+': 0, 'A': 1, 'B+': 2, 'B': 3, 'C': 4
    };
    
    allSignals.sort((a, b) => {
      const gradeDiff = gradeOrder[a.grade] - gradeOrder[b.grade];
      if (gradeDiff !== 0) return gradeDiff;
      return b.confidence - a.confidence;
    });
    
    // Filter by grades if specified
    let filteredSignals = allSignals;
    if (grades && grades.length > 0) {
      filteredSignals = allSignals.filter(s => grades.includes(s.grade as 'A+' | 'A' | 'B+'));
    }
    
    switch (action) {
      case 'stats': {
        const stats = {
          total: allSignals.length,
          byGrade: {
            'A+': allSignals.filter(s => s.grade === 'A+').length,
            'A': allSignals.filter(s => s.grade === 'A').length,
            'B+': allSignals.filter(s => s.grade === 'B+').length,
            'B': allSignals.filter(s => s.grade === 'B').length,
            'C': allSignals.filter(s => s.grade === 'C').length
          },
          byDirection: {
            LONG: allSignals.filter(s => s.direction === 'LONG').length,
            SHORT: allSignals.filter(s => s.direction === 'SHORT').length
          },
          avgConfidence: allSignals.length > 0
            ? Math.round(allSignals.reduce((sum, s) => sum + s.confidence, 0) / allSignals.length)
            : 0,
          avgMTFStrength: allSignals.length > 0
            ? Math.round(allSignals.reduce((sum, s) => sum + s.mtfStrength, 0) / allSignals.length)
            : 0,
          activeKillzone,
          rejectedCount: rejectedSignals.length,
          fundingFiltered: rejectedSignals.filter(r => r.reason.includes('funding')).length
        };
        return NextResponse.json({ success: true, data: stats });
      }
      
      case 'top': {
        // Return top signals by grade with position sizes
        const topSignals = {
          aPlus: filteredSignals
            .filter(s => s.grade === 'A+')
            .slice(0, 3)
            .map(s => ({
              ...s,
              suggestedPosition: s.positionSize // Include position size from risk calc
            })),
          a: filteredSignals
            .filter(s => s.grade === 'A')
            .slice(0, 5)
            .map(s => ({
              ...s,
              suggestedPosition: s.positionSize
            })),
          bPlus: filteredSignals
            .filter(s => s.grade === 'B+')
            .slice(0, 5)
            .map(s => ({
              ...s,
              suggestedPosition: s.positionSize
            }))
        };
        return NextResponse.json({ success: true, data: topSignals });
      }
      
      case 'rejected': {
        return NextResponse.json({
          success: true,
          data: {
            rejected: rejectedSignals,
            count: rejectedSignals.length
          }
        });
      }
      
      default:
        return NextResponse.json({
          success: true,
          data: {
            signals: filteredSignals,
            activeKillzone,
            count: filteredSignals.length,
            generatedAt: Date.now(),
            riskInfo: {
              fundingFilterActive: true,
              mtfConfirmation: true,
              positionSizing: true
            }
          }
        });
    }
    
  } catch (error) {
    console.error('Signals API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST endpoint for executing trades with full risk check
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { signal, accountBalance, dryRun = true } = body;
    
    if (!signal || !accountBalance) {
      return NextResponse.json(
        { success: false, error: 'Missing signal or account balance' },
        { status: 400 }
      );
    }
    
    // Get current price
    const priceResponse = await fetch(`${BINANCE_FUTURES_API}/ticker/price?symbol=${signal.symbol}`);
    if (!priceResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to get current price' },
        { status: 500 }
      );
    }
    
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price);
    
    // Get funding rate
    const fundingRate = await fetchFundingRate(signal.symbol);
    
    // In a real implementation, you'd check:
    // 1. Current open positions from database
    // 2. Today's P&L from trade history
    // 3. Correlation with existing positions
    
    // For now, return what the risk check WOULD return
    const mockPreTradeCheck = {
      canExecute: signal.grade === 'A+' || signal.grade === 'A',
      positionSize: signal.positionSize,
      fundingCheck: checkFundingFilter(fundingRate, signal.direction),
      currentPrice,
      fundingRate,
      dryRun,
      warnings: signal.grade === 'B+' ? ['B+ grade - reduced position size'] : []
    };
    
    return NextResponse.json({
      success: true,
      data: mockPreTradeCheck
    });
    
  } catch (error) {
    console.error('Trade execution error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}