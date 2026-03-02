import { ERROR_CODES } from '../config/constants'

type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

export class ApiError extends Error {
  statusCode: number
  code: ErrorCode | string
  errors?: unknown

  constructor(
    statusCode: number,
    message: string,
    errors?: unknown,
    code: ErrorCode | string = ERROR_CODES.INTERNAL_ERROR
  ) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.errors = errors
    Error.captureStackTrace(this, this.constructor)
  }
}