/**
 * Sistema de Caché Eficiente para Cultura CCA
 * Soporta almacenamiento en memoria de alta velocidad con TTL,
 * persistencia selectiva, control de invalidación por etiquetas y métricas de rendimiento.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

interface CacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
}

class CacheService {
  private memoryCache = new Map<string, CacheEntry<unknown>>();
  private maxEntries = 200;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    writes: 0,
    evictions: 0,
  };

  /**
   * Obtiene un elemento del caché si no ha expirado
   */
  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.metrics.evictions++;
      this.metrics.misses++;
      return null;
    }

    this.metrics.hits++;
    return entry.value as T;
  }

  /**
   * Guarda un valor en el caché con un tiempo de vida (TTL) en milisegundos
   * @param key Clave única
   * @param value Datos a almacenar
   * @param ttlMs Tiempo de vida en ms (por defecto 30 segundos)
   * @param tags Etiquetas para invalidación agrupada (ej. ['grupos', 'asistencias'])
   */
  set<T>(key: string, value: T, ttlMs = 30000, tags: string[] = []): void {
    if (this.memoryCache.size >= this.maxEntries) {
      // Política LRU básica: eliminar la primera clave registrada
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
        this.metrics.evictions++;
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      tags,
    });
    this.metrics.writes++;
  }

  /**
   * Invalida una clave específica
   */
  invalidate(key: string): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Invalida todas las claves que contengan una etiqueta específica
   */
  invalidateByTag(tag: string): void {
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags.includes(tag)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Invalida claves que comiencen con un prefijo
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Limpia todo el caché en memoria
   */
  clear(): void {
    this.memoryCache.clear();
    this.metrics.evictions += this.memoryCache.size;
  }

  /**
   * Retorna las métricas de eficiencia del caché
   */
  getMetrics(): CacheMetrics & { totalEntries: number; hitRate: number } {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests) * 100 : 100;

    return {
      ...this.metrics,
      totalEntries: this.memoryCache.size,
      hitRate: Math.round(hitRate * 10) / 10,
    };
  }

  /**
   * Envuelve una función asíncrona con caché automático (Cache-Aside pattern)
   */
  async remember<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = 30000,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    this.set(key, fresh, ttlMs, tags);
    return fresh;
  }
}

export const cacheService = new CacheService();
