import { Product } from '../../domain/entities/product.entity';

interface ProductRow {
  id: string;
  negocio_id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number | string;
  disponible: boolean;
  imagen_url: string | null;
}

export class ProductMapper {
  static toDomain(row: ProductRow): Product {
    return new Product(
      row.id,
      row.negocio_id,
      row.categoria_id,
      row.nombre,
      row.descripcion,
      Number(row.precio), // Postgres numeric: make sure it is a JS number
      row.disponible,
      row.imagen_url,
    );
  }
}