import { BadRequestException, ConflictException } from '@nestjs/common';

export function handleSupabaseAuthError(error: { message: string; status?: number }): never {
  const msg = error.message.toLowerCase();

  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
    throw new ConflictException('Ya existe una cuenta registrada con este correo');
  }

  if (msg.includes('password') && msg.includes('short')) {
    throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
  }

  if (msg.includes('invalid') && msg.includes('email')) {
    throw new BadRequestException('El correo electrónico no tiene un formato válido');
  }

  if (msg.includes('rate limit') || msg.includes('too many')) {
    throw new BadRequestException('Demasiados intentos. Intenta de nuevo en unos minutos');
  }

  // Fallback: no exponemos el mensaje crudo de Supabase al cliente
  throw new BadRequestException('No se pudo completar la operación. Intenta de nuevo');
}