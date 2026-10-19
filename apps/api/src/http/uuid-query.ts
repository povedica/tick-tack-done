import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function optionalUuid(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (!UUID.test(value)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      `${field} must be a uuid`,
    );
  }
  return value;
}
