import { ApiErrorBody } from '@crew-board/shared';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

export interface ApiError {
  status: number | 'NETWORK' | 'TIMEOUT' | 'PARSE';
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export function toApiError(e: FetchBaseQueryError): ApiError {
  if (e.status === 'FETCH_ERROR') {
    return {
      status: 'NETWORK',
      code: 'NETWORK',
      message: 'Cannot reach the server. Check your connection and try again.',
    };
  }
  if (e.status === 'TIMEOUT_ERROR') {
    return { status: 'TIMEOUT', code: 'TIMEOUT', message: 'The server took too long to answer. Try again.' };
  }
  if (typeof e.status !== 'number') {
    return { status: 'PARSE', code: 'PARSE', message: 'The server sent a reply we could not read.' };
  }
  const body = ApiErrorBody.safeParse(e.data);
  if (body.success) {
    const { code, message, requestId, details } = body.data.error;
    return { status: e.status, code, message, requestId, ...(details ? { details } : {}) };
  }
  return { status: e.status, code: 'HTTP', message: `The server answered ${e.status}. Try again in a moment.` };
}

const isApiError = (e: unknown): e is ApiError =>
  typeof e === 'object' && e !== null && 'code' in e && 'message' in e && 'status' in e;

export const errorMessage = (e: unknown): string => (isApiError(e) ? e.message : 'Something went wrong. Try again.');
