import { Router } from 'express'
import { authenticate, requireUser } from '../../middlewares/authenticate'
import { validate } from '../../utils/validate'
import { selectPackageSchema } from './subscription.schema'
import * as subscriptionController from './subscription.controller'

const router = Router()

// All subscription routes require authentication
// authenticate runs first, then requireUser blocks admins
router.use(authenticate, requireUser)

// ─────────────────────────────────────────────
// GET /api/subscriptions/packages
// All active packages — shown on subscription selection UI
// ─────────────────────────────────────────────

router.get('/packages', subscriptionController.getAvailablePackages)

// ─────────────────────────────────────────────
// GET /api/subscriptions/current
// Active package + real-time usage stats
// Powers the storage usage bar and limit indicators
// ─────────────────────────────────────────────

router.get('/current', subscriptionController.getCurrentSubscription)

// ─────────────────────────────────────────────
// GET /api/subscriptions/history
// Full subscription history — newest first
// Shows which package was active on which dates
// ─────────────────────────────────────────────

router.get('/history', subscriptionController.getSubscriptionHistory)

// ─────────────────────────────────────────────
// POST /api/subscriptions/select
// Switch to a different package
// ─────────────────────────────────────────────

router.post(
  '/select',
  validate(selectPackageSchema),
  subscriptionController.selectPackage
)

export default router