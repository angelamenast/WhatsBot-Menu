import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SupabaseModule } from './shared/supabase/supabase.module';
import { HealthController } from './health/health.controller';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,  // ventana de 60 segundos
        limit: 10,   // 10 peticiones por ventana, por defecto global
      },
    ]),
    AuthModule,
    BusinessModule,
    WhatsappModule,
    SubscriptionsModule,
    PaymentsModule,
    SupabaseModule,
  ],
  controllers: [AppController, HealthController],     
  providers: [AppService, 
     { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],

})
export class AppModule {}