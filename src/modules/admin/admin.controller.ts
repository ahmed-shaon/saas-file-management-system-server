import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { sendSuccess } from '../../utils/ApiResponse'
import * as adminService from './admin.service'

// ─────────────────────────────────────────────
// PACKAGE MANAGEMENT
// ─────────────────────────────────────────────

export const getAllPackages = asyncHandler(
  async (_req: Request, res: Response) => {
    const packages = await adminService.getAllPackages()

    return sendSuccess(res, 'Packages fetched successfully', { packages })
  }
)

export const createPackage = asyncHandler(
  async (req: Request, res: Response) => {
    const newPackage = await adminService.createPackage(req.body)

    return sendSuccess(res, 'Package created successfully', { package: newPackage }, 201)
  }
)

export const updatePackage = asyncHandler(
  async (req: Request, res: Response) => {
    // Extract as string explicitly — req.params values are always strings
    // but TypeScript types them as string | string[] in some configurations
    const id = req.params['id'] as string
    const updated = await adminService.updatePackage(id, req.body)

    return sendSuccess(res, 'Package updated successfully', { package: updated })
  }
)

export const deletePackage = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params['id'] as string
    const result = await adminService.deletePackage(id)

    return sendSuccess(res, result.message)
  }
)

// ─────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────

export const getAllUsers = asyncHandler(
  async (req: Request, res: Response) => {
    console.log("start tanvir");
    // Safely extract string query params
    // req.query values can be string | string[] | ParsedQs | ParsedQs[]
    // We extract only if it's a plain string, otherwise use default
    const rawPage = typeof req.query['page'] === 'string' ? req.query['page'] : '1'
    const rawLimit = typeof req.query['limit'] === 'string' ? req.query['limit'] : '10'

    const page = Math.max(1, parseInt(rawPage) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit) || 10))

    const result = await adminService.getAllUsers(page, limit);

    console.log("aksflksjflaksjdflkasdjflaksdjflsdk tanvir")

    return sendSuccess(res, 'Users fetched successfully', result)
  }
)

export const getUserDetail = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params['id'] as string
    const user = await adminService.getUserDetail(id)

    return sendSuccess(res, 'User fetched successfully', { user })
  }
)

export const updateUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params['id'] as string
    const result = await adminService.updateUserStatus(id, req.body)

    return sendSuccess(res, result.message, { user: result.user })
  }
)