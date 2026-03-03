// QuentrexKillzone OS v8.0 - Risk Dashboard Component
// Real-time risk monitoring UI
// Powered by Ko Htike + Kimi Claw

'use client';

import { useEffect, useState } from 'react';
import { useTradingStore } from '@/lib/store';
import type { LucideIcon } from 'lucide-react';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Activity,
  AlertCircle,
  CheckCircle,
  X
} from 'lucide-react';
import { format } from 'date-fns';

export function RiskDashboard() {
  const [mounted, setMounted] = useState(false);
  
  const {
    accountBalance,
    startingBalance,
    testMode,
    tradingLimits,
    riskConfig,
    performanceMetrics,
    alerts,
    trades,
    showRiskWarnings,
    toggleRiskWarnings,
    dismissAlert,
    refreshLimits
  } = useTradingStore();
  
  useEffect(() => {
    setMounted(true);
    refreshLimits();
    
    // Refresh limits every minute
    const interval = setInterval(refreshLimits, 60000);
    return () => clearInterval(interval);
  }, [refreshLimits]);
  
  if (!mounted) return null;
  
  const totalReturn = ((accountBalance - startingBalance) / startingBalance) * 100;
  const openPositions = trades.filter(t => t.status === 'OPEN').length;
  
  // Calculate risk exposure
  const totalRisk = trades
    .filter(t => t.status === 'OPEN')
    .reduce((sum, t) => sum + t.riskAmount, 0);
  
  const riskPercent = (totalRisk / accountBalance) * 100;
  
  return (
    <div className="space-y-6 p-6 bg-gray-900 rounded-xl border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-green-500" />
          <div>
            <h2 className="text-xl font-bold text-white">Risk Dashboard</h2>
            <p className="text-sm text-gray-400">Capital Protection System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {testMode && (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 text-sm rounded-full">
              TEST MODE
            </span>
          )}
          <button
            onClick={toggleRiskWarnings}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              showRiskWarnings 
                ? 'bg-green-500/20 text-green-500' 
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {showRiskWarnings ? 'Alerts ON' : 'Alerts OFF'}
          </button>
        </div>
      </div>
      
      {/* Account Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Account Balance"
          value={`$${accountBalance.toLocaleString()}`}
          subValue={`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
          subColor={totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
          icon={DollarSign}
        />
        
        <MetricCard
          title="Daily P&L"
          value={`${tradingLimits.dailyPnLPercent >= 0 ? '+' : ''}${tradingLimits.dailyPnLPercent.toFixed(2)}%`}
          subValue={`$${tradingLimits.dailyPnL.toFixed(2)}`}
          subColor={tradingLimits.dailyPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}
          icon={tradingLimits.dailyPnLPercent >= 0 ? TrendingUp : TrendingDown}
          alert={Math.abs(tradingLimits.dailyPnLPercent) >= 2}
        />
        
        <MetricCard
          title="Open Positions"
          value={`${openPositions}/${riskConfig.maxPositions}`}
          subValue={`Risk: ${riskPercent.toFixed(2)}%`}
          subColor={riskPercent > 10 ? 'text-red-500' : 'text-gray-400'}
          icon={Activity}
          alert={openPositions >= riskConfig.maxPositions}
        />
        
        㰼MetricCard
          title="Win Rate"
          value={`${performanceMetrics.winRate.toFixed(1)}%`}
          subValue={`${performanceMetrics.totalTrades} trades`}
          subColor={performanceMetrics.winRate >= 50 ? 'text-green-500' : 'text-yellow-500'}
          icon={CheckCircle}
        />
      </div>
      
      {/* Risk Limits Progress */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-300">Risk Limits</h3>
        
        {/* Daily Loss Limit */}
        㰼LimitBar
          label="Daily Loss Limit"
          current={Math.abs(tradingLimits.dailyPnLPercent)}
          max={riskConfig.maxDailyLoss * 100}
          unit="%"
          color={Math.abs(tradingLimits.dailyPnLPercent) >= riskConfig.maxDailyLoss * 100 ? 'red' : 'green'}
        />
        
        {/* Weekly Loss Limit */}
        <LimitBar
          label="Weekly Loss Limit"
          current={Math.abs(tradingLimits.weeklyPnLPercent)}
          max={riskConfig.maxWeeklyLoss * 100}
          unit="%"
          color={Math.abs(tradingLimits.weeklyPnLPercent) >= riskConfig.maxWeeklyLoss * 100 ? 'red' : 'green'}
        />
        
        {/* Position Limit */}
        <LimitBar
          label="Open Positions"
          current={openPositions}
          max={riskConfig.maxPositions}
          unit=""
          color={openPositions >= riskConfig.maxPositions ? 'red' : 'blue'}
        />
      </div>
      
      {/* Trading Status */}
      <div className={`p-4 rounded-lg border ${
        tradingLimits.canTrade 
          ? 'bg-green-500/10 border-green-500/30' 
          : 'bg-red-500/10 border-red-500/30'
      }`}>
        <div className="flex items-center gap-3">
          {tradingLimits.canTrade ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-green-500 font-medium">Trading Active</p>
                <p className="text-sm text-gray-400">All risk checks passed</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-red-500 font-medium">Trading Halted</p>
                <p className="text-sm text-gray-400">{tradingLimits.reason}</p>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Performance by Grade */}
      {performanceMetrics.totalTrades > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Performance by Grade</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['A+', 'A', 'B+'] as const).map(grade => {
              const data = performanceMetrics.byGrade[grade];
              if (!data) return null;
              
              return (
                <div key={grade} className="p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{grade}</span>
                    <span className={`text-sm ${
                      data.winRate >= 50 ? 'text-green-500' : 'text-yellow-500'
                    }`}>
                      {data.winRate.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{data.trades} trades</p>
                  <p className={`text-sm ${data.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Active Alerts */}
      {alerts.length > 0 && showRiskWarnings && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Active Alerts ({alerts.length})</h3>
            <button
              onClick={() => alerts.forEach((_, i) => dismissAlert(i))}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Clear all
            </button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {alerts.slice(0, 10).map((alert, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border flex items-start justify-between ${
                  alert.priority === 'CRITICAL' 
                    ? 'bg-red-500/10 border-red-500/30' 
                    : alert.priority === 'HIGH'
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-blue-500/10 border-blue-500/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  {alert.priority === 'CRITICAL' && <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />}
                  {alert.priority === 'HIGH' && <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />}
                  {alert.priority === 'MEDIUM' && <Activity className="w-4 h-4 text-blue-500 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-medium ${
                      alert.priority === 'CRITICAL' ? 'text-red-500' : 
                      alert.priority === 'HIGH' ? 'text-yellow-500' : 'text-blue-500'
                    }`}>
                      {alert.title}
                    </p>
                    <p className="text-xs text-gray-400">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(alert.timestamp), 'HH:mm:ss')}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => dismissAlert(index)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function MetricCard({ 
  title, 
  value, 
  subValue, 
  subColor = 'text-gray-400',
  icon: Icon,
  alert = false
}: {
  title: string;
  value: string;
  subValue: string;
  subColor?: string;
  icon: React.ElementType;
  alert?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${
      alert ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-800 border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-400">{title}</p>
        <Icon className={`w-5 h-5 ${alert ? 'text-red-500' : 'text-gray-500'}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className={`text-sm ${subColor}`}>{subValue}</p>
    </div>
  );
}

function LimitBar({ 
  label, 
  current, 
  max, 
  unit,
  color = 'green'
}: {
  label: string;
  current: number;
  max: number;
  unit: string;
  color?: 'green' | 'red' | 'blue';
}) {
  const percentage = Math.min(100, (current / max) * 100);
  
  const colors = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500'
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className={`font-medium ${current >= max ? 'text-red-500' : 'text-white'}`}>
          {current.toFixed(2)}{unit} / {max}{unit}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[color]} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}