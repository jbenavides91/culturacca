import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center space-x-2.5 rounded-xl bg-amber-500/95 text-white px-3.5 py-2 text-xs font-semibold shadow-lg backdrop-blur-xs animate-in slide-in-from-bottom-2 duration-200">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo sin conexión — Los datos se sincronizarán al reconectar.</span>
    </div>
  );
};
