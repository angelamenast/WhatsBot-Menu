export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos');
  }
}

export class CorreoYaRegistradoError extends Error {
  constructor() {
    super('Ya existe una cuenta registrada con este correo');
  }
}

export class SesionExpiradaError extends Error {
  constructor() {
    super('Sesión expirada, inicia sesión de nuevo');
  }
}

export class RegistroPerfilFallidoError extends Error {
  constructor() {
    super('No se pudo crear el perfil del usuario');
  }
}