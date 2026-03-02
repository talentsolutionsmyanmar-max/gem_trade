'use client';

import { useEffect, useState } from 'react';
import { RiskDashboard } from '@/components/RiskDashboard';
import { useTradingStore } from '@/lib/store';
import { getCurrentKillzone, getMMTTime, formatTime, formatDate } from '@/lib/killzones';
import { Activity, Shield, TrendingUp, Clock, AlertCircle } from 'lucide-react';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [mmtTime, setMmtTime] = useState(getMMTTime());
  
  const { 
    accountBalance, 
    testMode, 
    currentKillzone,
    setCurrentKillzone,
    refreshLimits
  } = useTradingStore();
  
  useEffect(() => {
    setMounted(true);
    refreshLimits();
    
    // Update time every second
    const interval = setInterval(() => {
      const now = getMMTTime();
      setMmtTime(now);
      setCurrentKillzone(getCurrentKillzone(now));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [setCurrentKillzone, refreshLimits]);
  
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 animate-pulse text-green-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading QuentrexKillzone OS v8.0...</p>
        </div>
      </div>
    );
  }
  
  const kzColors: Record<string, string> = {
    'AKZ': 'text-green-500',
    'LKZ': 'text-cyan-400',
    'NYKZ': 'text-purple-500',
    'NONE': 'text-gray-500'
  };
  
  const kzEmojis: Record<string, string> = {
    'AKZ': '🌏',
    'LKZ': '🏰',
    'NYKZ': '🗽',
    'NONE': '⏳'
  };
  
  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">QuentrexKillzone OS</h1>
                <p className="text-sm text-gray-400">v8.0 • Risk-First Trading System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              {/* MMT Time */}
              <div className="text-right">
                <div className="flex items-center gap-2 text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Myanmar Time (MMT)</span>
                </div>
                <p className="text-2xl font-mono font-bold text-white">{formatTime(mmtTime)}</p>
                <p className="text-sm text-gray-500">{formatDate(mmtTime)}</p>
              </div>
              
              {/* Killzone Status */}
              <div className={`px-4 py-2 rounded-lg border ${
                currentKillzone !== 'NONE' 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-gray-800 border-gray-700'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{kzEmojis[currentKillzone]}</span>
                  <div>
                    <p className={`font-bold ${kzColors[currentKillzone]}`}>
                      {currentKillzone === 'NONE' ? 'NO KILLZONE' : currentKillzone}
                    </p>
                    <p className="text-xs text-gray-400">
                      {currentKillzone !== 'NONE' ? 'ACTIVE' : 'WAITING'}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Test Mode Badge */}
              {testMode && (
                <div className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-500">TEST MODE</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Risk Dashboard - Takes 2 columns */}
          <div className="lg:col-span-2">
            <RiskDashboard />
          </div>
          
          {/* Side Panel */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-green-500" />
                <h3 className="font-bold text-white">Account Overview</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400">Balance</p>
                  <p className="text-3xl font-bold text-white">${accountBalance.toLocaleString()}</p>
                </div>
                
                <div className="h-px bg-gray-800" />
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Risk per Trade</span>
                    <span className="text-white font-medium">2% max</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Daily Loss Limit</span>
                    <span className="text-white font-medium">-3%</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Max Positions</span>
                    <span className="text-white font-medium">5</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Killzone Schedule */}
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
              <h3 className="font-bold text-white mb-4">Killzone Schedule</h3>
              
              <div className="space-y-3">
                {[
                  { name: 'Asia (AKZ)', time: '06:30 - 10:00', color: 'text-green-500' },
                  { name: 'London (LKZ)', time: '13:00 - 17:00', color: 'text-cyan-400' },
                  { name: 'New York (NYKZ)', time: '18:15 - 22:15', color: 'text-purple-500' },
                ].map((kz) => (
                  <div key={kz.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className={`font-medium ${kz.color}`}>{kz.name}</p>
                      <p className="text-sm text-gray-400">{kz.time} MMT</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Links */}
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
              <h3 className="font-bold text-white mb-4">Quick Links</h3>
              
              <div className="space-y-2">
                <a 
                  href="/api/signals"
                  target="_blank"
                  className="block p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <p className="text-white font-medium">📊 Signals API</p>
                  <p className="text-sm text-gray-400">Live trading signals</p>
                </a>
                
                <a 
                  href="/api/signals?action=stats"
                  target="_blank"
                  className="block p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <p className="text-white font-medium">📈 Signal Stats</p>
                  <p className="text-sm text-gray-400">Performance metrics</p>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}