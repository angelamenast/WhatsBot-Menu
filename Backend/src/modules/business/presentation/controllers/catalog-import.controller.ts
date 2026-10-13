import {
  BadRequestException,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { PreviewCatalogImportUseCase } from '../../application/use-cases/preview-catalog-import.use-case';
import { PreviewCatalogImportCommand } from '../../application/dto/preview-catalog-import.command';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors'; // existing name
import {
  CatalogTooLargeError,
  InvalidCatalogFileError,
} from '../../domain/errors/catalog-import.errors';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../../../shared/types/authenticated-request';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
type UploadedXlsx = { buffer: Buffer };

@Controller('business/catalog/import')
@UseGuards(SupabaseAuthGuard)
export class CatalogImportController {
  constructor(private readonly previewCatalogImportUseCase: PreviewCatalogImportUseCase) {}

  // multipart/form-data with the .xlsx in the "file" field. Nothing is saved here.
  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } }))
  async preview(@Req() req: AuthenticatedRequest, @UploadedFile() file: UploadedXlsx | undefined) {
    if (!file) {
      throw new BadRequestException('Debes enviar el archivo Excel en el campo "file"');
    }

    try {
      return await this.previewCatalogImportUseCase.execute(new PreviewCatalogImportCommand(req.user.id, file.buffer));
    } catch (error) {
      if (error instanceof NegocioNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidCatalogFileError || error instanceof CatalogTooLargeError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }
}
