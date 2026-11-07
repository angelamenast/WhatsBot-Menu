export class Product {
  constructor(
    public readonly id: string,
    public readonly businessId: string,
    public readonly categoryId: string | null,
    public readonly name: string,
    public readonly description: string | null,
    public readonly price: number,
    public readonly available: boolean,
    public readonly imageUrl: string | null,
  ) {}
}