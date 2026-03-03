import { Router } from 'express'
import { authenticate, requireAdmin } from '../../middlewares/authenticate'
import { validate } from '../../utils/validate'
import {
  createPackageSchema,
  updatePackageSchema,
  updateUserStatusSchema,
} from './admin.schema'
import * as adminController from './admin.controller'

const router = Router()

// All admin routes require authentication + admin role
// Order matters: authenticate first, then requireAdmin
router.use(authenticate, requireAdmin)

// ─────────────────────────────────────────────
// PACKAGE ROUTES
// /api/admin/packages
// ─────────────────────────────────────────────

// GET /api/admin/packages — all packages including inactive
router.get('/packages', adminController.getAllPackages)

// POST /api/admin/packages — create new package
router.post(
  '/packages',
  validate(createPackageSchema),
  adminController.createPackage
)

// PUT /api/admin/packages/:id — update package
router.put(
  '/packages/:id',
  validate(updatePackageSchema),
  adminController.updatePackage
)

// DELETE /api/admin/packages/:id — soft delete package
router.delete('/packages/:id', adminController.deletePackage)

// ─────────────────────────────────────────────
// USER ROUTES
// /api/admin/users
// ─────────────────────────────────────────────

// GET /api/admin/users?page=1&limit=10 — paginated user list
router.get('/users', adminController.getAllUsers)

// GET /api/admin/users/:id — user detail + full history
router.get('/users/:id', adminController.getUserDetail)

// PUT /api/admin/users/:id/status — activate or deactivate user
router.put(
  '/users/:id/status',
  validate(updateUserStatusSchema),
  adminController.updateUserStatus
)

export default router