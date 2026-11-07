import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { PlanActivoGuard } from '../subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { CatalogService } from './catalog.service';
import { CatalogProductDto, ImportCatalogDto } from './catalog.dto';
type AccountRequest=Request & {user:{id:string}};
@Controller('catalog') @UseGuards(SupabaseAuthGuard)
export class CatalogController {
 constructor(private readonly catalog:CatalogService){}
 @Get() list(@Req() req:AccountRequest){return this.catalog.list(req.user.id);}
 @Post() @UseGuards(PlanActivoGuard) create(@Req() req:AccountRequest,@Body() dto:CatalogProductDto){return this.catalog.create(req.user.id,[dto]).then(items=>items[0]);}
 @Post('import') @UseGuards(PlanActivoGuard) import(@Req() req:AccountRequest,@Body() dto:ImportCatalogDto){return this.catalog.create(req.user.id,dto.items);}
 @Put(':id') @UseGuards(PlanActivoGuard) update(@Req() req:AccountRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CatalogProductDto){return this.catalog.update(req.user.id,id,dto);}
 @Delete(':id') @UseGuards(PlanActivoGuard) remove(@Req() req:AccountRequest,@Param('id',ParseUUIDPipe) id:string){return this.catalog.remove(req.user.id,id);}
}
