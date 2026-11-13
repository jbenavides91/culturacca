import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, PenTool, Check, Sparkles } from 'lucide-react';

interface DigitalSignaturePadProps {
  signerName?: string;
  onSaveSignature: (signatureDataUrl: string) => void;
  initialSignature?: string;
  disabled?: boolean;
}

export const DigitalSignaturePad: React.FC<DigitalSignaturePadProps> = ({
  signerName = 'Padre / Madre / Tutor',
  onSaveSignature,
  initialSignature,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale for high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Initial canvas setup
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
        setIsSaved(true);
      };
      img.src = initialSignature;
    }
  }, [initialSignature]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (disabled) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setHasSignature(true);
    setIsSaved(false);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || disabled) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl);
    setIsSaved(true);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    setIsSaved(false);
    onSaveSignature('');
  };

  const handleGenerateSample = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw stylized cursive sample
    const baseY = rect.height * 0.55;
    ctx.beginPath();
    ctx.moveTo(30, baseY + 10);
    ctx.bezierCurveTo(45, baseY - 35, 75, baseY - 40, 85, baseY);
    ctx.bezierCurveTo(95, baseY + 20, 115, baseY - 15, 135, baseY - 5);
    ctx.bezierCurveTo(155, baseY + 15, 175, baseY - 25, 205, baseY);
    ctx.bezierCurveTo(230, baseY + 25, 260, baseY - 30, 290, baseY - 10);
    // Flourish underline
    ctx.moveTo(25, baseY + 22);
    ctx.bezierCurveTo(120, baseY + 28, 220, baseY + 26, 320, baseY + 18);
    ctx.stroke();

    setHasSignature(true);
    setIsSaved(true);
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 font-semibold text-[#172033] dark:text-[#F1F5F9]">
          <PenTool className="w-3.5 h-3.5 text-[#4F46E5] dark:text-[#818CF8]" />
          <span>Firma Digital del Tutor Legal</span>
          <span className="text-[11px] font-normal text-[#667085] dark:text-[#94A3B8]">
            ({signerName})
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {!disabled && (
            <>
              <button
                type="button"
                onClick={handleGenerateSample}
                className="text-[11px] text-[#4F46E5] dark:text-[#818CF8] hover:underline font-medium flex items-center space-x-1 cursor-pointer"
                title="Generar trazo estilizado de prueba"
              >
                <Sparkles className="w-3 h-3" />
                <span>Trazo de Muestra</span>
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={handleClear}
                disabled={!hasSignature}
                className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-medium flex items-center space-x-1 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Signature Canvas Box */}
      <div
        className={`relative w-full h-36 rounded-xl border-2 transition-all overflow-hidden bg-white dark:bg-[#0B0F17] ${
          hasSignature
            ? 'border-indigo-400 dark:border-indigo-600 shadow-xs'
            : 'border-dashed border-slate-300 dark:border-slate-700'
        } ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-crosshair'}`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full touch-none"
        />

        {/* Guiding baseline & watermark */}
        <div className="absolute inset-x-6 bottom-7 border-b border-dashed border-slate-300 dark:border-slate-700 pointer-events-none flex justify-between items-end pb-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
            Línea de firma legal digital
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
            {signerName}
          </span>
        </div>

        {!hasSignature && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 dark:text-slate-600 text-xs">
            <div className="text-center">
              <p className="font-medium">Dibuje su firma aquí con el ratón o en pantalla táctil</p>
              <p className="text-[10px] opacity-75">Trazado continuo seguro para el contrato institucional</p>
            </div>
          </div>
        )}

        {isSaved && (
          <div className="absolute top-2 right-2 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1 pointer-events-none">
            <Check className="w-3 h-3" />
            <span>Firma Registrada</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
        Al firmar digitalmente, el tutor acepta con plena validez legal los términos y reglamentos institucionales estipulados en el contrato.
      </p>
    </div>
  );
};
