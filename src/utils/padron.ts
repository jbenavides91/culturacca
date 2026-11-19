/**
 * Utilidades puras del padrón de alumnos (sin importar storageService, para evitar
 * importaciones circulares): normalizar texto, separar nombres y apellidos de un
 * nombre completo y emparejar el grado del Excel con el catálogo.
 */

/** Minúsculas, sin tildes ni espacios repetidos (la ñ se conserva como n) */
export const normalizarTexto = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Clave para detectar a la misma persona: nombre completo normalizado, sin guiones */
export const claveNombre = (nombre: string, apellido: string): string =>
  normalizarTexto(`${nombre} ${apellido}`.replace(/\s*-\s*/g, ' '));

/** Partículas que se unen a la palabra siguiente: "del Rosario", "de la Cruz" */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'da', 'van', 'von']);

/**
 * Nombres de pila frecuentes que suelen ir en segundo lugar. Sirven para decidir
 * los nombres de 3 palabras: "Valeria Isabel Gaitán" (2 nombres + 1 apellido)
 * frente a "Luciana Solórzano Delgado" (1 nombre + 2 apellidos).
 */
const SEGUNDOS_NOMBRES = new Set(
  [
    'maria', 'jose', 'isabel', 'isabella', 'sofia', 'valentina', 'alejandra', 'alejandro', 'gabriela', 'gabriel',
    'fernanda', 'fernando', 'lucia', 'camila', 'daniela', 'daniel', 'andrea', 'andres', 'antonio', 'antonia',
    'carolina', 'cristina', 'elena', 'eugenia', 'francisco', 'francisca', 'guadalupe', 'ignacio', 'ines',
    'javier', 'jesus', 'juan', 'julia', 'julieta', 'laura', 'luis', 'luisa', 'manuel', 'margarita', 'mariana',
    'mercedes', 'miguel', 'nicole', 'paola', 'patricia', 'paula', 'rafael', 'regina', 'renata', 'ricardo',
    'roberto', 'rosa', 'rosario', 'sebastian', 'teresa', 'valeria', 'victoria', 'abigail', 'alexandra',
    'auxiliadora', 'beatriz', 'carlos', 'david', 'eduardo', 'emilia', 'esther', 'fabiola', 'gabriel', 'jimena',
    'ximena', 'josefina', 'lorena', 'marcela', 'mateo', 'nayela', 'nathalia', 'natalia', 'pablo', 'raquel',
    'salvador', 'samuel', 'santiago', 'sara', 'scarleth', 'yesenia', 'alberto', 'alonso', 'armando', 'belen',
    'concepcion', 'del carmen', 'carmen', 'dolores', 'emmanuel', 'enrique', 'ernesto', 'felipe', 'gonzalo',
    'joaquin', 'jorge', 'leonardo', 'lourdes', 'marcelo', 'martin', 'nicolas', 'oscar', 'pilar', 'ramon',
    'rodrigo', 'sergio', 'tomas', 'vicente',
  ].map(normalizarTexto)
);

/** Divide el texto en palabras, juntando apellidos con guion y partículas */
function tokenizar(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  // "Díaz - Lacayo" o "Díaz-Lacayo" cuentan como un solo apellido
  const palabras = limpio.replace(/\s*-\s*/g, '\u0000').split(' ').map((p) => p.replace(/\u0000/g, ' - '));
  const tokens: string[] = [];
  let pendiente = '';
  for (const p of palabras) {
    if (PARTICULAS.has(normalizarTexto(p))) {
      pendiente = pendiente ? `${pendiente} ${p}` : p;
      continue;
    }
    tokens.push(pendiente ? `${pendiente} ${p}` : p);
    pendiente = '';
  }
  if (pendiente) {
    if (tokens.length > 0) tokens[tokens.length - 1] += ` ${pendiente}`;
    else tokens.push(pendiente);
  }
  return tokens;
}

/**
 * Separa "Nombres Apellidos" en sus partes. Regla: los dos últimos bloques son los
 * apellidos. Con 3 bloques decide por el segundo: si es un nombre de pila frecuente,
 * son 2 nombres + 1 apellido. `dudosa` marca los casos que conviene revisar.
 */
export function separarNombreCompleto(texto: string): { nombre: string; apellido: string; dudosa: boolean } {
  const t = tokenizar(texto);
  if (t.length === 0) return { nombre: '', apellido: '', dudosa: true };
  if (t.length === 1) return { nombre: t[0], apellido: '', dudosa: true };
  if (t.length === 2) return { nombre: t[0], apellido: t[1], dudosa: false };
  if (t.length === 3) {
    const segundoEsNombre = SEGUNDOS_NOMBRES.has(normalizarTexto(t[1]));
    const tieneGuion = t[1].includes('-') || t[2].includes('-');
    if (segundoEsNombre && !tieneGuion) {
      return { nombre: `${t[0]} ${t[1]}`, apellido: t[2], dudosa: true };
    }
    return { nombre: t[0], apellido: `${t[1]} ${t[2]}`, dudosa: !tieneGuion };
  }
  return { nombre: t.slice(0, -2).join(' '), apellido: t.slice(-2).join(' '), dudosa: false };
}

/** "7mo", "7", "7° grado", "Séptimo"… → número de grado (null si no se reconoce) */
function numeroDeGrado(texto: string): number | null {
  const n = normalizarTexto(texto);
  const m = n.match(/^(\d{1,2})/);
  if (m) return Number(m[1]);
  const ordinales = [
    'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'septimo', 'octavo', 'noveno', 'decimo', 'undecimo',
  ];
  const i = ordinales.findIndex((o) => n.startsWith(o));
  return i >= 0 ? i + 1 : null;
}

/**
 * Empareja el grado escrito en el Excel con un nombre del catálogo:
 * igual sin tildes ni mayúsculas, o mismo número ("7mo" → "7mo Grado").
 */
export function emparejarGrado(texto: string, catalogo: string[]): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const n = normalizarTexto(limpio);
  const exacto = catalogo.find((g) => normalizarTexto(g) === n);
  if (exacto) return exacto;
  const num = numeroDeGrado(limpio);
  if (num === null) return null;
  return catalogo.find((g) => numeroDeGrado(g) === num) ?? null;
}
