import React, { useEffect, useState } from 'react';
import { AlertTriangle, Layers, Loader2, RefreshCw, X } from 'lucide-react';
import { clearSyncError, subscribeToSyncState, SyncState } from '../services/supabase.sync';

/**
 * Indicador flotante del estado de sincronización con Supabase:
 * muestra "Guardando…" mientras hay escrituras pendientes y un aviso si alguna falló.
 */
export const SyncStatus: React.FC = () => {
  const [state, setState] = useState<SyncState>({ pending: 0, lastError: null });
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => subscribeToSyncState(setState), []);

  // Evitar parpadeos: mostrar "Guardando…" solo si tarda más de 400ms
  useEffect(() => {
    if (state.pending === 0) {
      setShowSaving(false);
      return;
    }
    const t = setTimeout(() => setShowSaving(true), 400);
    return () => clearTimeout(t);
  }, [state.pending]);

  if (!state.lastError && !showSaving) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm space-y-2">
      {state.lastError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs shadow-lg flex items-start gap-2 animate-fadeIn"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span className="flex-1 leading-relaxed">{state.lastError}</span>
          <button
            onClick={clearSyncError}
            className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-100 cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {showSaving && (
        <div className="ml-auto w-fit px-3 py-1.5 rounded-full bg-white dark:bg-[#1B222D] border border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-semibold text-[#667085] dark:text-[#94A3B8] shadow-md flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4F46E5]" />
          <span>Guardando cambios…</span>
        </div>
      )}
    </div>
  );
};

interface FullScreenAction {
  label: string;
  onClick: () => void;
}

interface FullScreenMessageProps {
  variant: 'loading' | 'error';
  title: string;
  message?: string;
  primaryAction?: FullScreenAction;
  secondaryAction?: FullScreenAction;
}

/** Pantalla completa para estados de carga inicial o error de conexión */
export const FullScreenMessage: React.FC<FullScreenMessageProps> = ({
  variant,
  title,
  message,
  primaryAction,
  secondaryAction,
}) => (
  <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
    <div className="max-w-sm w-full text-center space-y-4">
      <div
        className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center ${
          variant === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
        }`}
      >
        {variant === 'error' ? <AlertTriangle className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
      </div>
      <div className="space-y-1">
        <h1 className="text-base font-bold flex items-center justify-center gap-2">
          {variant === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
          {title}
        </h1>
        {message && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center justify-center gap-2">
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);
