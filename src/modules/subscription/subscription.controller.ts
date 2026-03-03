import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { sendSuccess } from '../../utils/ApiResponse'
import * as subscriptionService from './subscription.service'

// ─────────────────────────────────────────────
// GET ALL AVAILABLE PACKAGES
// Public-facing list for the subscription selection UI
// ─────────────────────────────────────────────

export const getAvailablePackages = asyncHandler(
  async (_req: Request, res: Response) => {
    const packages = await subscriptionService.getAvailablePackages()

    return sendSuccess(res, 'Packages fetched successfully', { packages })
  }
)

// ─────────────────────────────────────────────
// GET CURRENT SUBSCRIPTION + USAGE
// ─────────────────────────────────────────────

export const getCurrentSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await subscriptionService.getCurrentSubscription(
      req.user!.id
    )

    return sendSuccess(res, 'Current subscription fetched successfully', result)
  }
)

// ─────────────────────────────────────────────
// GET SUBSCRIPTION HISTORY
// ─────────────────────────────────────────────

export const getSubscriptionHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const history = await subscriptionService.getSubscriptionHistory(
      req.user!.id
    )

    return sendSuccess(res, 'Subscription history fetched successfully', {
      history,
    })
  }
)

// ─────────────────────────────────────────────
// SELECT PACKAGE
// ─────────────────────────────────────────────

export const selectPackage = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await subscriptionService.selectPackage(
      req.user!.id,
      req.body
    )

    return sendSuccess(res, result.message, {
      subscription: result.subscription,
      package: result.package,
    })
  }
)