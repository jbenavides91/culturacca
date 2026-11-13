import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSignature,
  FileUp,
  Pencil,
  RotateCcw,
  Save,
} from 'lucide-react';
import { storageService, subscribeToData } from '../../services/storage.service';
import {
  ContractData,
  PLANTILLA_CONTRATO_PREDETERMINADA,
  VARIABLES_CONTRATO,
  renderContrato,
  variablesDesconocidas,
} from '../../utils/contractTemplate';

const DATOS_EJEMPLO: ContractData = {
  codigoAlumno: 'CCA-2026-001',
  nombreAlumno: 'María José López',
  edad: 10,
  grado: '5to Grado',
  aulaRegular: 'Aula 5-A',
  nombreTutor: 'Ana López',
  cedulaTutor: '001-010180-0001A',
  parentesco: 'Madre',
  telefonoTutor: '+505 8888-0000',
  emailTutor: 'ana.lopez@correo.com',
  tallerNombre: 'Pintura al Óleo',
  tallerHorario: '14:00 a 16:00',
  tallerDias: 'Lunes y Miércoles',
  tallerAula: 'Taller de Artes 1',
};

const plantillaGuardada = () => {
  const p = storageService.getConfiguracion().plantilla_contrato;
  return p && p.trim() ? p : PLANTILLA_CONTRATO_PREDETERMINADA;
};

export const ContractTemplateTab: React.FC = () => {
  const [texto, setTexto] = useState<string>(plantillaGuardada);
  const [guardado, setGuardado] = useState<string>(plantillaGuardada);
  const [modo, setModo] = useState<'editar' | 'vista'>('editar');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const guardadoRef = useRef(guardado);

  // Si otra persona cambia la plantilla y aquí no hay cambios sin guardar, actualizar
  useEffect(() => {
    return subscribeToData(() => {
      const actual = plantillaGuardada();
      const anterior = guardadoRef.current;
      if (actual === anterior) return;
      guardadoRef.current = actual;
      setGuardado(actual);
      setTexto((t) => (t === anterior ? actual : t));
    });
  }, []);

  const hayCambios = texto !== guardado;
  const esPersonalizada = guardado !== PLANTILLA_CONTRATO_PREDETERMINADA;
  const desconocidas = useMemo(() => variablesDesconocidas(texto), [texto]);
  const vistaPrevia = useMemo(() => renderContrato(texto, DATOS_EJEMPLO), [texto]);

  const insertarVariable = (clave: string) => {
    const variable = `{{${clave}}}`;
    const el = textareaRef.current;
    if (!el || modo !== 'editar') {
      setTexto((t) => t + variable);
      return;
    }
    const inicio = el.selectionStart;
    const fin = el.selectionEnd;
    const nuevo = texto.slice(0, inicio) + variable + texto.slice(fin);
    setTexto(nuevo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + variable.length, inicio + variable.length);
    });
  };

  const handleGuardar = () => {
    if (!texto.trim()) {
      setMensaje(null);
      setErrorArchivo('El contrato no puede quedar vacío.');
      return;
    }
    // Si coincide con la predeterminada se guarda vacío, para recibir futuras mejoras de la plantilla base
    const valor = texto === PLANTILLA_CONTRATO_PREDETERMINADA ? undefined : texto;
    guardadoRef.current = texto;
    storageService.updateConfiguracion({ plantilla_contrato: valor });
    setGuardado(texto);
    setErrorArchivo(null);
    setMensaje('Plantilla de contrato guardada. Se usará en las nuevas matrículas y renovaciones.');
    setTimeout(() => setMensaje(null), 4000);
  };

  const handleRestablecer = () => {
    if (
      window.confirm(
        '¿Restablecer la plantilla original? Se reemplazará el texto del editor (no se guarda hasta que presiones "Guardar").'
      )
    ) {
      setTexto(PLANTILLA_CONTRATO_PREDETERMINADA);
    }
  };

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorArchivo(null);
    if (!/\.(txt|md)$/i.test(file.name)) {
      setErrorArchivo('Solo se admiten archivos de texto (.txt o .md). Si tienes un Word, copia y pega el texto.');
      return;
    }
    if (file.size > 200_000) {
      setErrorArchivo('El archivo es demasiado grande (máximo 200 KB).');
      return;
    }
    const contenido = await file.text();
    setTexto(contenido);
    setModo('editar');
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {mensaje && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{mensaje}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#141A23] rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {/* Encabezado */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileSignature className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">Plantilla del Contrato de Matrícula</h3>
              <p className="text-[11px] text-slate-300">
                Este texto se muestra al tutor para firmar en nuevas matrículas y renovaciones anuales.
              </p>
            </div>
          </div>
          <span
            className={`self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold border ${
              esPersonalizada
                ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
                : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
            }`}
          >
            {esPersonalizada ? 'Versión personalizada' : 'Versión predeterminada'}
          </span>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 text-xs">
          {/* Editor / Vista previa */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
                <button
                  type="button"
                  onClick={() => setModo('editar')}
                  className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 cursor-pointer ${
                    modo === 'editar'
                      ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setModo('vista')}
                  className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 cursor-pointer ${
                    modo === 'vista'
                      ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Vista previa
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,text/plain"
                  onChange={handleArchivo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                  title="Cargar el texto del contrato desde un archivo .txt"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Cargar .txt
                </button>
                <button
                  type="button"
                  onClick={handleRestablecer}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restablecer original
                </button>
              </div>
            </div>

            {errorArchivo && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorArchivo}</span>
              </div>
            )}

            {modo === 'editar' ? (
              <textarea
                ref={textareaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                spellCheck
                aria-label="Texto del contrato"
                className="w-full h-[520px] resize-y rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1A222D] text-slate-900 dark:text-slate-100 p-3 font-mono text-[12px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            ) : (
              <div className="h-[520px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0B0F17] p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">
                  Vista previa con datos de ejemplo
                </p>
                <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-800 dark:text-slate-200">
                  {vistaPrevia}
                </pre>
              </div>
            )}

            {desconocidas.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Estas variables no existen y se mostrarán tal cual:{' '}
                  <strong className="font-mono">{desconocidas.map((d) => `{{${d}}}`).join(', ')}</strong>
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                {hayCambios ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'} Los contratos ya firmados no se modifican.
              </span>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {hayCambios && (
                  <button
                    type="button"
                    onClick={() => setTexto(guardado)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGuardar}
                  disabled={!hayCambios}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Guardar contrato
                </button>
              </div>
            </div>
          </div>

          {/* Variables disponibles */}
          <aside className="space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              Variables disponibles
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Haz clic para insertarla donde está el cursor. Se reemplaza con los datos de cada matrícula. Escríbela en
              MAYÚSCULAS (p. ej. <code className="font-mono">{'{{NOMBRE_ALUMNO}}'}</code>) para que el valor salga en
              mayúsculas.
            </p>
            <div className="space-y-1 max-h-[480px] overflow-auto pr-1">
              {VARIABLES_CONTRATO.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  onClick={() => insertarVariable(v.clave)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                >
                  <code className="block font-mono text-[11px] text-indigo-600 dark:text-indigo-400">{`{{${v.clave}}}`}</code>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{v.descripcion}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
