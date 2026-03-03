import { Request, Response, NextFunction } from 'express'
import { ZodType, ZodError } from 'zod'
import { ApiError } from './ApiError'
import { ERROR_CODES } from '../config/constants'

// ─────────────────────────────────────────────
// VALIDATE MIDDLEWARE FACTORY
//
// Usage in routes:
//   router.post('/register', validate(registerSchema), controller.register)
//
// Runs BEFORE the controller.
// Parses and validates req.body against the schema.
// On failure: throws ApiError with field-level errors.
// On success: replaces req.body with the parsed (typed) data.
//
// ZodType is used instead of ZodSchema — ZodSchema was removed in Zod v4.
// ─────────────────────────────────────────────

export const validate =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (schema: ZodType<any>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // parse() throws ZodError on failure
      // On success, returns the parsed and transformed value
      // (trimmed strings, lowercased emails, etc.)
      const parsed = schema.parse(req.body)

      // Replace req.body with Zod-parsed output so controllers
      // receive clean, typed, transformed data
      req.body = parsed

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        // Build field-level error map: { fieldName: ["error message"] }
        // Compatible with both Zod v3 and v4 error shapes
        const fieldErrors: Record<string, string[]> = {}

        error.issues.forEach((issue) => {
          const field = issue.path.join('.') || 'root'
          if (!fieldErrors[field]) {
            fieldErrors[field] = []
          }
          fieldErrors[field].push(issue.message)
        })

        return next(
          new ApiError(
            400,
            'Validation failed',
            fieldErrors,
            ERROR_CODES.VALIDATION_ERROR
          )
        )
      }
      next(error)
    }
  }