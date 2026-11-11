export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly nombre: string,
    public readonly telefono?: string,
  ) {}
}