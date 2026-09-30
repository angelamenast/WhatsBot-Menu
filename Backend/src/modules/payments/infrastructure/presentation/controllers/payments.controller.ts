import { Body, Controller, Post, Req, UseGuards, HttpCode, Headers, BadRequestException, NotFoundException, UnauthorizedException, Inject } from '@nestjs/common';
import { GenerarLinkPagoUseCase } from '../../../domain/repositories/application/use-cases/generar-link-pago.use-case';
import { ProcesarWebhookPagoUseCase } from '../../../domain/repositories/application/use-cases/procesar-webhook-pago.use-case';
import { GenerarLinkPagoCommand } from '../../../domain/repositories/application/dto/generar-link-pago.command';
import { ProcesarWebhookPagoCommand } from '../../../domain/repositories/application/dto/procesar-webhook-pago.command';
import { GenerarLinkPagoRequestDto } from '../dto/generar-link-pago-request.dto';
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import type { PaymentGatewayPort } from '../../../domain/repositories/application/ports/out/payment-gateway.port';
import { PAYMENT_GATEWAY } from '../../../domain/repositories/application/ports/out/payment-gateway.port';
import { PlanNoEncontradoError, TransaccionNoEncontradaError } from '../../../domain/errors/payments.errors';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';
import type { NegocioRepository } from '../../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../../business/domain/repositories/negocio.repository';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly generarLinkPagoUseCase: GenerarLinkPagoUseCase,
    private readonly procesarWebhookPagoUseCase: ProcesarWebhookPagoUseCase,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
    @Inject(NEGOCIO_REPOSITORY) private readonly negocioRepository: NegocioRepository,
  ) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('generate-link')
  async generarLink(@Req() req: AuthenticatedRequest, @Body() dto: GenerarLinkPagoRequestDto) {
    try {
      let negocioId = dto.negocioId;
      if (!negocioId) {
        const negocio = await this.negocioRepository.buscarPorUsuario(req.user.id);
        if (!negocio) {
          throw new NotFoundException('No tienes un negocio registrado para asociar a este plan');
        }
        negocioId = negocio.id;
      }
      const command = new GenerarLinkPagoCommand(negocioId, dto.planId);
      return await this.generarLinkPagoUseCase.execute(command);
    } catch (error) {
      if (error instanceof PlanNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException('No se pudo generar el link de pago');
    }
  }

  // Sin guard de auth: quien llama esto es Wompi, no un usuario logueado.
  // La seguridad depende de verificar la firma, no de un Bearer token.
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() payload: any, @Headers('x-signature') signature: string) {
    const esValida = this.paymentGateway.verificarFirmaWebhook({
      referencia: payload?.data?.transaction?.reference,
      estado: payload?.data?.transaction?.status,
      firmaRecibida: payload?.signature?.checksum ?? signature,
      crudo: payload,
    });

    if (!esValida) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    try {
      const command = new ProcesarWebhookPagoCommand(
        payload.data.transaction.reference,
        payload.data.transaction.status,
      );
      await this.procesarWebhookPagoUseCase.execute(command);
      return { received: true };
    } catch (error) {
      if (error instanceof TransaccionNoEncontradaError) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException('No se pudo procesar el webhook');
    }
  }
}