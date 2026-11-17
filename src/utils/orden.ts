/**
 * Orden alfabético de listas. Las listas abren en 'AZ'; cada vista puede añadir
 * su propia opción (p. ej. 'RECIENTES', 'FALTAS') a través de `OrdenSelector`.
 * Personas: ordenar por [apellido, nombre].
 */
export type DireccionAlfabetica = 'AZ' | 'ZA';
export type Orden = DireccionAlfabetica | (string & {});

/** Compara sin distinguir mayúsculas ni tildes, y con números naturales ("Aula 2" < "Aula 10") */
export function compararTexto(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '', 'es', { sensitivity: 'base', numeric: true });
}

/** Copia de `lista` ordenada por las claves dadas, en el orden en que se listan */
export function ordenarAlfabetico<T>(
  lista: readonly T[],
  claves: (x: T) => (string | null | undefined)[],
  dir: DireccionAlfabetica = 'AZ'
): T[] {
  const signo = dir === 'ZA' ? -1 : 1;
  return [...lista].sort((x, y) => {
    const kx = claves(x);
    const ky = claves(y);
    for (let i = 0; i < kx.length; i++) {
      const c = compararTexto(kx[i], ky[i]);
      if (c !== 0) return c * signo;
    }
    return 0;
  });
}

/** true si el orden elegido es alfabético (y no una opción propia de la lista) */
export function esAlfabetico(orden: Orden): orden is DireccionAlfabetica {
  return orden === 'AZ' || orden === 'ZA';
}
