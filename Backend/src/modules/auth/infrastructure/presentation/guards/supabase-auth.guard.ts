import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../../../../shared/supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    const token = authHeader.split(' ')[1];
    const client = this.supabaseService.getClient();

    let result: Awaited<ReturnType<typeof client.auth.getUser>>;
    try {
      result = await client.auth.getUser(token);
    } catch {
      throw new ServiceUnavailableException('No pudimos conectar con el servicio de acceso. Inténtalo de nuevo en un momento.');
    }
    const { data, error } = result;
    if (error && (error.name === 'AuthRetryableFetchError' || !error.status || error.status >= 500 || error.status === 429)) {
      throw new ServiceUnavailableException('El servicio de acceso no está disponible en este momento. Inténtalo de nuevo.');
    }

    if (error || !data.user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // Adjunta el usuario a la request para usarlo en los controllers
    request.user = data.user;
    return true;
  }
}