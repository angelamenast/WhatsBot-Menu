import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express'; 
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';

@Controller('business')
@UseGuards(SupabaseAuthGuard)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  create(
    @Req() request: Request & { user: any }, // 👈 Tipo explícito aquí
    @Body() dto: CreateBusinessDto
  ) {
    return this.businessService.create(request.user.id, dto);
  }

  @Get('mine')
  getMine(@Req() req: Request & { user: any }) { // 👈 Tipo explícito aquí
    console.log(req.user);
    return this.businessService.findByUsuario(req.user.id);
  }
}