import { HttpException } from '@nestjs/common';

export class DomainException extends HttpException {
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super({ code, message, details }, status);
  }
}
