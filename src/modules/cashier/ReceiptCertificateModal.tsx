import React from 'react';
import { FileCheck2, Printer, X } from 'lucide-react';
import { SolicitudMatricula } from '../../types/attendance';
import { nombreInstitucion } from '../../utils/institucion';
import { formatearMonto, montoDeSolicitud } from '../../utils/arancel';

export const formatFechaCaja = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

interface ReceiptCertificateModalProps {
  solicitud: SolicitudMatricula;
  onClose: () => void;
}

export const ReceiptCertificateModal: React.FC<ReceiptCertificateModalProps> = ({ solicitud, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
    <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
      <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <FileCheck2 className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold">Comprobante y Constancia Oficial de Matrícula</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4 text-xs font-sans">
        <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-800 space-y-1">
          <h2 className="text-base font-bold text-[#172033] dark:text-[#F1F5F9] tracking-wide">
            {nombreInstitucion().toUpperCase()}
          </h2>
          <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
            VENTANILLA DE CAJA • COMPROBANTE OFICIAL DE SOLVENCIA Y MATRÍCULA
          </p>
          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            MATRÍCULA ACEPTADA Y SOLVENTE
          </span>
        </div>

        <div className="space-y-2 bg-[#F7F8FA] dark:bg-[#151A22] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442]">
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">N° Recibo Caja:</span>
            <span className="font-mono font-bold text-emerald-600 text-sm">{solicitud.numero_recibo_caja}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Código de Trámite:</span>
            <span className="font-mono font-bold text-[#4F46E5]">{solicitud.codigo_solicitud}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Código de Alumno:</span>
            <span className="font-mono font-bold">{solicitud.codigo_alumno}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Nombre del Alumno:</span>
            <span className="font-bold text-[#172033] dark:text-[#F1F5F9]">
              {solicitud.nombre_alumno} {solicitud.apellido_alumno}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Grado y Aula Regular:</span>
            <span>{solicitud.grado} ({solicitud.aula_regular})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Taller Extracurricular:</span>
            <span className="font-bold text-[#4F46E5]">{solicitud.grupo_nombre}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Monto Cobrado:</span>
            <span className="font-mono font-bold text-[#172033] dark:text-[#F1F5F9]">
              {formatearMonto(montoDeSolicitud(solicitud))} ({solicitud.metodo_pago || 'Efectivo'})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Cajera Responsable:</span>
            <span>{solicitud.cajero_nombre || 'Ventanilla de Caja'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] dark:text-[#94A3B8]">Fecha de Formalización:</span>
            <span>{formatFechaCaja(solicitud.fecha_aceptacion || solicitud.fecha_pago || '')}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Comprobante</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </div>
);
