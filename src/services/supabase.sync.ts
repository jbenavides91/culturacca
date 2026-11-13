import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

/**
 * Capa de persistencia "hidratada":
 *  - Al iniciar sesión se descargan todas las tablas a memoria (hydrate).
 *  - Las lecturas son síncronas desde memoria (la app no necesita async).
 *  - Las escrituras se aplican de inmediato en memoria (optimistas) y se envían
 *    a Supabase en una cola serial que respeta el orden de llamadas (FKs).
 *  - Realtime mantiene la memoria al día con cambios de otros dispositivos.
 *  - Si Supabase rechaza una operación, se notifica el error y se re-hidrata.
 */

export type StorageKey =
  | 'aa_perfiles'
  | 'aa_tutores'
  | 'aa_estudiantes'
  | 'aa_grupos'
  | 'aa_inscripciones'
  | 'aa_sesiones'
  | 'aa_asistencias'
  | 'aa_log_notificaciones'
  | 'aa_configuracion'
  | 'aa_matriculas'
  | 'aa_anecdotario'
  | 'aa_salones'
  | 'aa_grados';

interface TableDef {
  table: string;
  columns: string[];
  /** Tags de cacheService a invalidar cuando la tabla cambia */
  tags: string[];
  /** Tabla de solo inserción (sin UPDATE en RLS): usar ON CONFLICT DO NOTHING */
  insertOnly?: boolean;
  /**
   * Valores para columnas NOT NULL cuando la fila de la app no trae el campo.
   * Sin esto, project() enviaría null y Postgres rechazaría todo el lote.
   */
  defaults?: Row;
}

export const TABLES: Record<StorageKey, TableDef> = {
  aa_perfiles: {
    table: 'perfiles',
    columns: ['id', 'nombre', 'apellido', 'email', 'username', 'rol', 'cargo', 'especialidad', 'telefono', 'activo', 'creado_en'],
    tags: ['perfiles'],
  },
  aa_tutores: {
    table: 'tutores',
    columns: ['id', 'nombre', 'email', 'telefono', 'parentesco', 'creado_en'],
    tags: ['tutores', 'alertas'],
  },
  aa_estudiantes: {
    table: 'estudiantes',
    columns: [
      'id', 'matricula', 'nombre', 'apellido', 'edad', 'grado', 'aula_regular', 'tutor_id', 'creado_en',
      'avatar_url', 'solvente', 'numero_recibo_caja', 'matricula_solicitud_id', 'estado', 'fecha_baja',
      'motivo_baja', 'fecha_reactivacion', 'ciclo_actual', 'contrato_vigente', 'contrato_texto',
      'fecha_renovacion_contrato', 'firma_digital_url', 'fecha_firma', 'firmante_nombre', 'estado_pago_anual',
      'fecha_ultimo_pago_anual', 'numero_recibo_anual', 'observaciones_renovacion',
    ],
    tags: ['estudiantes', 'alertas'],
  },
  aa_grupos: {
    table: 'grupos',
    columns: ['id', 'nombre', 'profesor_id', 'dias_semana', 'hora_inicio', 'hora_fin', 'fecha_inicio_ciclo', 'fecha_fin_ciclo', 'aula', 'color_tag', 'costo', 'creado_en'],
    tags: ['grupos', 'alertas'],
  },
  aa_inscripciones: {
    table: 'inscripciones',
    columns: ['id', 'grupo_id', 'estudiante_id', 'fecha_inscripcion'],
    tags: ['inscripciones', 'estudiantes', 'alertas'],
  },
  aa_sesiones: {
    table: 'sesiones',
    columns: ['id', 'grupo_id', 'fecha', 'hora_inicio', 'hora_fin', 'cerrada', 'fecha_cierre', 'tema', 'google_calendar_event_id', 'extraordinaria'],
    tags: ['sesiones', 'alertas'],
    defaults: { cerrada: false, extraordinaria: false },
  },
  aa_asistencias: {
    table: 'asistencias',
    columns: ['id', 'sesion_id', 'estudiante_id', 'estatus', 'motivo_justificacion', 'registrado_por', 'actualizado_en'],
    tags: ['asistencias', 'alertas'],
  },
  aa_log_notificaciones: {
    table: 'log_notificaciones',
    columns: [
      'id', 'idempotency_key', 'asistencia_id', 'estudiante_id', 'estudiante_nombre', 'tutor_id', 'tutor_email',
      'tutor_nombre', 'taller_nombre', 'fecha_sesion', 'tipo', 'estatus_entrega', 'metodo', 'detalles_error', 'enviado_en',
    ],
    tags: ['logs'],
  },
  aa_configuracion: {
    table: 'configuracion',
    columns: ['id', 'limite_ausencias_alerta', 'porcentaje_inasistencia_alerta', 'nombre_institucion', 'email_remitente', 'ciclo_academico_actual', 'plantilla_contrato', 'arancel_taller', 'arancel_periodo', 'updated_at'],
    tags: ['config', 'alertas'],
  },
  aa_matriculas: {
    table: 'matriculas',
    columns: [
      'id', 'codigo_solicitud', 'tipo_tramite', 'estudiante_id', 'ciclo_academico', 'codigo_alumno', 'nombre_alumno',
      'apellido_alumno', 'edad', 'grado', 'aula_regular', 'tutor_nombre', 'tutor_email', 'tutor_telefono',
      'tutor_parentesco', 'tutor_cedula', 'grupo_id', 'grupo_nombre', 'fecha_solicitud', 'contrato_texto',
      'contrato_firmado', 'firma_digital_url', 'fecha_firma', 'firmante_nombre', 'estado', 'validado_datos',
      'validado_contrato', 'solvente', 'numero_recibo_caja', 'monto_arancel', 'metodo_pago', 'cajero_nombre',
      'cajero_observaciones', 'fecha_pago', 'fecha_aceptacion', 'estudiante_id_creado',
    ],
    tags: ['matriculas'],
  },
  aa_anecdotario: {
    table: 'anecdotario',
    columns: [
      'id', 'estudiante_id', 'grupo_id', 'sesion_id', 'autor_id', 'autor_nombre', 'tipo', 'descripcion', 'creado_en',
      'editado_en', 'editado_por_nombre',
    ],
    tags: ['anecdotario'],
    insertOnly: true,
  },
  aa_salones: {
    table: 'salones',
    columns: ['id', 'nombre', 'ubicacion', 'capacidad', 'activo', 'creado_en'],
    tags: ['salones'],
  },
  aa_grados: {
    table: 'grados',
    columns: ['id', 'nombre', 'orden', 'activo', 'creado_en'],
    tags: ['grados'],
    defaults: { orden: 0, activo: true },
  },
};

const ALL_KEYS = Object.keys(TABLES) as StorageKey[];
const KEY_BY_TABLE = new Map(ALL_KEYS.map((k) => [TABLES[k].table, k]));
const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 500;

type Row = Record<string, unknown>;

// ---------- Estado de sincronización (para la UI) ----------
export interface SyncState {
  pending: number;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;
const syncListeners = new Set<SyncListener>();
let syncState: SyncState = { pending: 0, lastError: null };

function setSyncState(partial: Partial<SyncState>) {
  syncState = { ...syncState, ...partial };
  syncListeners.forEach((l) => l(syncState));
}

export const subscribeToSyncState = (listener: SyncListener) => {
  syncListeners.add(listener);
  listener(syncState);
  return () => {
    syncListeners.delete(listener);
  };
};

export const clearSyncError = () => setSyncState({ lastError: null });

// ---------- Utilidades ----------
const rowId = (row: Row) => String(row.id);

/** null → undefined, para respetar los tipos opcionales de la app */
function normalizeFromDb(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null) out[k] = v;
  }
  return out;
}

/** Proyección con todas las columnas conocidas (ausentes → default de la tabla, o null) */
function project(key: StorageKey, row: Row): Row {
  const out: Row = {};
  const defaults = TABLES[key].defaults;
  for (const col of TABLES[key].columns) {
    const v = row[col];
    out[col] = v === undefined ? (defaults && col in defaults ? defaults[col] : null) : v;
  }
  return out;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

// ---------- Store ----------
class SyncStore {
  private data = new Map<StorageKey, Map<string, Row>>();
  private queue: Promise<void> = Promise.resolve();
  private channel: RealtimeChannel | null = null;
  private onExternalChange: ((keys: StorageKey[]) => void) | null = null;
  private pendingChangedKeys = new Set<StorageKey>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private rehydrating = false;

  constructor() {
    ALL_KEYS.forEach((k) => this.data.set(k, new Map()));
  }

  /** Callback para invalidar caché y refrescar vistas tras cambios remotos */
  setExternalChangeHandler(handler: (keys: StorageKey[]) => void) {
    this.onExternalChange = handler;
  }

  read<T>(key: StorageKey): T[] {
    return structuredClone(Array.from(this.data.get(key)!.values())) as T[];
  }

  /**
   * Guarda los registros de `rows` que cambiaron respecto a memoria (insert/update).
   * Nunca borra implícitamente: para eliminar usar `remove()`.
   */
  write(key: StorageKey, rows: Row[]): void {
    const map = this.data.get(key)!;
    const changed: Row[] = [];

    for (const row of rows) {
      const id = rowId(row);
      const existing = map.get(id);
      const projected = project(key, row);
      if (!existing || JSON.stringify(project(key, existing)) !== JSON.stringify(projected)) {
        changed.push(projected);
        map.set(id, normalizeFromDb(structuredClone(projected)));
      }
    }

    if (changed.length === 0) return;

    const { table, insertOnly } = TABLES[key];
    this.enqueue(async () => {
      for (let i = 0; i < changed.length; i += UPSERT_CHUNK) {
        const { error } = await supabase
          .from(table)
          .upsert(changed.slice(i, i + UPSERT_CHUNK), insertOnly ? { ignoreDuplicates: true } : undefined);
        if (error) throw error;
      }
    }, `guardar en ${table}`);
  }

  /**
   * Actualiza solo las columnas indicadas de un registro existente (UPDATE ... WHERE id).
   * Necesario para tablas `insertOnly`, cuyo upsert ignora los duplicados, y para
   * tablas con privilegios de UPDATE por columna.
   */
  update(key: StorageKey, id: string, patch: Row): void {
    const map = this.data.get(key)!;
    const existing = map.get(id);
    if (!existing) throw new Error('El registro ya no existe.');
    const columnas = new Set(TABLES[key].columns);
    const limpio: Row = {};
    Object.entries(patch).forEach(([k, v]) => {
      if (k !== 'id' && columnas.has(k)) limpio[k] = v === undefined ? null : v;
    });
    if (Object.keys(limpio).length === 0) return;
    map.set(id, normalizeFromDb({ ...existing, ...limpio }));

    const table = TABLES[key].table;
    this.enqueue(async () => {
      const { data, error } = await supabase.from(table).update(limpio).eq('id', id).select('id');
      if (error) throw error;
      // La RLS filtra en silencio: 0 filas significa que no había permiso para editar
      if (!data || data.length === 0) throw new Error('sin permiso para modificar el registro');
    }, `actualizar en ${table}`);
  }

  remove(key: StorageKey, ids: string[]): void {
    if (ids.length === 0) return;
    const map = this.data.get(key)!;
    ids.forEach((id) => map.delete(id));
    const table = TABLES[key].table;
    this.enqueue(async () => {
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
    }, `eliminar en ${table}`);
  }

  /** Aplica en memoria un registro ya persistido por otra vía (p. ej. Edge Function) */
  applyRemote(key: StorageKey, row: Row | null, deletedId?: string) {
    const map = this.data.get(key)!;
    if (row) map.set(rowId(row), normalizeFromDb(row));
    if (deletedId) map.delete(deletedId);
  }

  private enqueue(task: () => Promise<void>, label: string) {
    setSyncState({ pending: syncState.pending + 1 });
    this.queue = this.queue
      .then(task)
      .catch((e: unknown) => {
        console.error(`Error de sincronización (${label}):`, e);
        setSyncState({
          lastError: `No se pudo ${label}: ${errorMessage(e)}. Se recargaron los datos desde el servidor.`,
        });
        void this.rehydrateAfterError();
      })
      .finally(() => {
        setSyncState({ pending: Math.max(0, syncState.pending - 1) });
      });
  }

  private async rehydrateAfterError() {
    if (this.rehydrating) return;
    this.rehydrating = true;
    try {
      await this.queue.catch(() => undefined);
      await this.hydrate();
      this.onExternalChange?.(ALL_KEYS);
    } catch (e) {
      console.error('Error al recargar datos tras fallo de sincronización:', e);
    } finally {
      this.rehydrating = false;
    }
  }

  /** Espera a que terminen las escrituras pendientes */
  flush(): Promise<void> {
    return this.queue;
  }

  async hydrate(): Promise<void> {
    const results = await Promise.all(
      ALL_KEYS.map(async (key) => {
        const table = TABLES[key].table;
        const rows: Row[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(`Error al cargar ${table}: ${error.message}`);
          rows.push(...((data ?? []) as Row[]));
          if (!data || data.length < PAGE_SIZE) break;
        }
        return [key, rows] as const;
      })
    );

    for (const [key, rows] of results) {
      const map = new Map<string, Row>();
      rows.forEach((r) => map.set(rowId(r), normalizeFromDb(r)));
      this.data.set(key, map);
    }
  }

  startRealtime() {
    this.stopRealtime();
    this.channel = supabase
      .channel('cca-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const key = KEY_BY_TABLE.get(payload.table);
        if (!key) return;
        const map = this.data.get(key)!;
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as Row;
          if (oldRow?.id !== undefined) map.delete(rowId(oldRow));
        } else {
          const newRow = payload.new as Row;
          map.set(rowId(newRow), normalizeFromDb(newRow));
        }
        this.scheduleExternalNotify(key);
      })
      .subscribe();
  }

  private scheduleExternalNotify(key: StorageKey) {
    this.pendingChangedKeys.add(key);
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      const keys = Array.from(this.pendingChangedKeys);
      this.pendingChangedKeys.clear();
      this.notifyTimer = null;
      this.onExternalChange?.(keys);
    }, 150);
  }

  stopRealtime() {
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  reset() {
    this.stopRealtime();
    ALL_KEYS.forEach((k) => this.data.set(k, new Map()));
    setSyncState({ pending: 0, lastError: null });
  }
}

export const syncStore = new SyncStore();
