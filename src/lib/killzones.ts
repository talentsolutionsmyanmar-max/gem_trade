// QuentrexKillzone OS v7.0 - Killzone Time Utilities
// Powered by Ko Htike
// Myanmar Time (MMT) UTC+6:30

import type { KillzoneType, KillzoneConfig } from '@/types/trading';

// MMT is UTC+6:30
const MMT_OFFSET_HOURS = 6.5;

// Killzone configurations in MMT
export const KILLZONE_CONFIGS: KillzoneConfig[] = [
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
];

// Convert UTC to MMT (Myanmar Time)
export function toMMT(utcDate: Date = new Date()): Date {
  const utcMs = utcDate.getTime() + utcDate.getTimezoneOffset() * 60000;
  return new Date(utcMs + MMT_OFFSET_HOURS * 3600000);
}

// Get current MMT time
export function getMMTTime(): Date {
  return toMMT(new Date());
}

// Format time as HH:MM:SS
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Format date as Day, DD Mon
export function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Check if current time is within a killzone
export function getCurrentKillzone(mmtTime: Date = getMMTTime()): KillzoneType {
  const currentMinutes = mmtTime.getHours() * 60 + mmtTime.getMinutes();
  
  for (const kz of KILLZONE_CONFIGS) {
    const startMinutes = kz.startHour * 60 + kz.startMinute;
    const endMinutes = kz.endHour * 60 + kz.endMinute;
    
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return kz.type;
    }
  }
  
  return 'NONE';
}

// Get active killzone config
export function getActiveKillzoneConfig(mmtTime: Date = getMMTTime()): KillzoneConfig | null {
  const currentKz = getCurrentKillzone(mmtTime);
  return KILLZONE_CONFIGS.find(kz => kz.type === currentKz) || null;
}

// Get time until next killzone
export function getTimeUntilNextKillzone(mmtTime: Date = getMMTTime()): { 
  killzone: KillzoneConfig; 
  hoursRemaining: number; 
  minutesRemaining: number;
  totalMinutes: number;
} | null {
  const currentMinutes = mmtTime.getHours() * 60 + mmtTime.getMinutes();
  
  // Sort killzones by start time
  const sortedKz = [...KILLZONE_CONFIGS].sort((a, b) => {
    const aStart = a.startHour * 60 + a.startMinute;
    const bStart = b.startHour * 60 + b.startMinute;
    return aStart - bStart;
  });
  
  // Find next killzone
  for (const kz of sortedKz) {
    const startMinutes = kz.startHour * 60 + kz.startMinute;
    
    if (startMinutes > currentMinutes) {
      const diff = startMinutes - currentMinutes;
      return {
        killzone: kz,
        hoursRemaining: Math.floor(diff / 60),
        minutesRemaining: diff % 60,
        totalMinutes: diff
      };
    }
  }
  
  // If no killzone found today, return first one for tomorrow
  const firstKz = sortedKz[0];
  const firstKzStart = firstKz.startHour * 60 + firstKz.startMinute;
  const diff = (24 * 60 - currentMinutes) + firstKzStart;
  
  return {
    killzone: firstKz,
    hoursRemaining: Math.floor(diff / 60),
    minutesRemaining: diff % 60,
    totalMinutes: diff
  };
}

// Check if it's the "fire" time (NYKZ most volatile period)
export function isFireTime(mmtTime: Date = getMMTTime()): boolean {
  const currentMinutes = mmtTime.getHours() * 60 + mmtTime.getMinutes();
  // First 2 hours of NYKZ are most volatile
  const nykzStart = 18 * 60 + 15;
  const fireEnd = 20 * 60 + 15;
  
  return currentMinutes >= nykzStart && currentMinutes < fireEnd;
}

// Get killzone progress percentage
export function getKillzoneProgress(mmtTime: Date = getMMTTime()): number {
  const activeKz = getActiveKillzoneConfig(mmtTime);
  if (!activeKz) return 0;
  
  const currentMinutes = mmtTime.getHours() * 60 + mmtTime.getMinutes();
  const startMinutes = activeKz.startHour * 60 + activeKz.startMinute;
  const endMinutes = activeKz.endHour * 60 + activeKz.endMinute;
  const totalDuration = endMinutes - startMinutes;
  const elapsed = currentMinutes - startMinutes;
  
  return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
}

// Get trading session info
export function getTradingSessionInfo(mmtTime: Date = getMMTTime()) {
  const currentKz = getCurrentKillzone(mmtTime);
  const activeConfig = getActiveKillzoneConfig(mmtTime);
  const nextKz = getTimeUntilNextKillzone(mmtTime);
  const progress = getKillzoneProgress(mmtTime);
  const fire = isFireTime(mmtTime);
  
  return {
    currentKillzone: currentKz,
    activeConfig,
    nextKillzone: nextKz,
    progress,
    isFireTime: fire,
    mmtTime,
    formattedTime: formatTime(mmtTime),
    formattedDate: formatDate(mmtTime)
  };
}