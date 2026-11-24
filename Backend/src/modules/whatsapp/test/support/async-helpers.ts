/**
 * Utilidades para controlar el orden de ejecución en las pruebas de integración sin esperas por
 * tiempo: promesas diferidas y una barrera que fuerza que N llamadas concurrentes coincidan en un
 * punto antes de continuar.
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Barrera de un solo uso: las primeras `parties` llamadas a `wait()` quedan detenidas hasta que
 * llega la última; entonces se liberan todas juntas. Las llamadas posteriores pasan sin esperar.
 * Se usa para provocar carreras deterministas (p. ej. dos peticiones que leen "no existe" antes de
 * que cualquiera escriba). Si llegan menos llamadas que `parties`, la prueba se queda colgada.
 */
export class Barrier {
  private arrived = 0;
  private readonly released = createDeferred<void>();

  constructor(private readonly parties: number) {}

  async wait(): Promise<void> {
    this.arrived += 1;

    if (this.arrived >= this.parties) {
      this.released.resolve();
    }

    await this.released.promise;
  }
}

/** Cede el turno al siguiente macrotask (no mide tiempo): vacía todos los microtasks pendientes. */
export function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
