import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
@Module({imports:[AuthModule,BusinessModule,SubscriptionsModule],controllers:[CatalogController],providers:[CatalogService]})
export class CatalogModule {}
