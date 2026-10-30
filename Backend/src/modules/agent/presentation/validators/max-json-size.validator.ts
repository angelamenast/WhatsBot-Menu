import { ValidationOptions, registerDecorator } from 'class-validator';

/** Valida que el valor, serializado como JSON, no supere `maxBytes` bytes (UTF-8). */
export function MaxJsonSize(maxBytes: number, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'maxJsonSize',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: {
        message: `${propertyName} no puede superar ${maxBytes} bytes serializado`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) {
            return true;
          }
          return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes;
        },
      },
    });
  };
}
