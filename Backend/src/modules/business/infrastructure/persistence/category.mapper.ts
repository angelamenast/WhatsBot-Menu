import { Category } from '../../domain/entities/category.entity';

interface CategoryRow {
  id: string;
  negocio_id: string;
  nombre: string;
}

export class CategoryMapper {
  static toDomain(row: CategoryRow): Category {
    return new Category(row.id, row.negocio_id, row.nombre);
  }
}