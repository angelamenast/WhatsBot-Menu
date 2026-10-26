import type { CatalogImportInput } from '../../domain/services/plan-catalog-import';

export class ConfirmCatalogImportCommand {
  constructor(
    public readonly userId: string,
    // Rows reviewed (and possibly corrected) by the owner. Never trusted: they are re-validated.
    public readonly input: CatalogImportInput,
  ) {}
}
