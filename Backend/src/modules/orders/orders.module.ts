import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';

import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { SupabaseOrderRepository } from './infrastructure/persistence/supabase-order.repository';
import { CATALOG_LOOKUP_REPOSITORY } from './domain/repositories/catalog-lookup.repository';
import { SupabaseCatalogLookupRepository } from './infrastructure/persistence/supabase-catalog-lookup.repository';

import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { ListOrdersByBusinessUseCase } from './application/use-cases/list-orders-by-business.use-case';
import { CancelOrderUseCase } from './application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from './application/use-cases/confirm-order.use-case';

import { OrdersController } from './presentation/controllers/orders.controller';

@Module({
  imports: [ConfigModule, AuthModule, BusinessModule],
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: SupabaseOrderRepository },
    {
      provide: CATALOG_LOOKUP_REPOSITORY,
      useClass: SupabaseCatalogLookupRepository,
    },

    CreateOrderUseCase,
    GetOrderUseCase,
    ListOrdersByBusinessUseCase,
    CancelOrderUseCase,
    ConfirmOrderUseCase,
  ],
  // CreateOrderUseCase se exporta para que AgentModule (o quien adapte el
  // contrato, siguiendo el mismo patrón de "Opción C" que agent/whatsapp) lo
  // use como implementación real de OrderPort.
  exports: [CreateOrderUseCase],
})
export class OrdersModule {}
