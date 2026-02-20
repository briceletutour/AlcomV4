'use client';

import { cn } from '@/lib/utils';

interface TankProgressProps {
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  currentLevel: number;
  capacity: number;
  className?: string;
  showLabels?: boolean;
}

export function TankProgress({
  fuelType,
  currentLevel,
  capacity,
  className,
  showLabels = true,
}: TankProgressProps) {
  const percentage = capacity > 0 ? Math.min((currentLevel / capacity) * 100, 100) : 0;
  
  // Color coding: green > 50%, yellow 20-50%, red < 20%
  const getBarColor = () => {
    if (percentage >= 50) return 'bg-green-500';
    if (percentage >= 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Fuel type badge colors
  const getFuelBadgeColor = () => {
    switch (fuelType) {
      case 'ESSENCE': return 'bg-amber-100 text-amber-800';
      case 'GASOIL': return 'bg-slate-100 text-slate-800';
      case 'PETROLE': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  const fuelBadgeColor = getFuelBadgeColor();

  return (
    <div className={cn('w-full', className)}>
      {showLabels && (
        <div className="flex justify-between items-center mb-1">
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', fuelBadgeColor)}>
            {fuelType}
          </span>
          <span className="text-xs text-muted-foreground">
            {currentLevel.toLocaleString()} / {capacity.toLocaleString()} L
          </span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getBarColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabels && (
        <div className="text-right mt-1">
          <span className="text-xs font-medium text-muted-foreground">
            {percentage.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

interface TankCardProps {
  tank: {
    id: string;
    fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
    capacity: number;
    currentLevel: number;
  };
}

export function TankCard({ tank }: TankCardProps) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <TankProgress
        fuelType={tank.fuelType}
        currentLevel={tank.currentLevel}
        capacity={tank.capacity}
      />
    </div>
  );
}
