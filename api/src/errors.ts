import type { ErrorCode } from '@crew-board/shared';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_SIGNATURE: 401,
  NOT_FOUND: 404,
  ASSIGNMENT_OVERLAP: 409,
  SKILL_MISSING: 409,
  POSITION_FULL: 409,
  ALREADY_ASSIGNED: 409,
  TECHNICIAN_INACTIVE: 409,
  SYNC_IN_PROGRESS: 409,
  DUPLICATE_EVENT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} was not found.`);
