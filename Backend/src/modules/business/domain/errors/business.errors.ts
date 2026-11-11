export class NegocioYaExisteError extends Error {
  constructor() {
    super('Ya tienes un negocio registrado');
  }
}

export class NegocioNoEncontradoError extends Error {
  constructor() {
    super('Negocio no encontrado');
  }
}