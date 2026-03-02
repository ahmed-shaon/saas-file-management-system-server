import { Response } from 'express'

export const sendSuccess = (
  res: Response,
  message: string,
  data?: unknown,
  statusCode = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
  })
}