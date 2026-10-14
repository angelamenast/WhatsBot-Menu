export class RefreshSessionCommand {
  constructor(
    public readonly refreshToken: string,
  ) {}
}