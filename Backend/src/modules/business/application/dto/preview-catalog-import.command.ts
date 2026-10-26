export class PreviewCatalogImportCommand {
  constructor(
    public readonly userId: string,
    public readonly file: Buffer,
  ) {}
}
