import { Usuario } from '../entities/usuario.entity';

export interface SesionAuth {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthRepository {
  crearUsuarioAuth(email: string, password: string, nombre: string): Promise<{ id: string; email: string }>;
  crearPerfil(id: string, nombre: string, telefono: string | null): Promise<Usuario>;
  eliminarUsuarioAuth(id: string): Promise<void>;
  login(email: string, password: string): Promise<SesionAuth>;
  refresh(refreshToken: string): Promise<SesionAuth>;
  logout(accessToken: string): Promise<void>;
  solicitarRecuperacion(email: string): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');