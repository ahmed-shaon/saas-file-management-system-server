import { Router } from 'express'
import { authenticate, requireUser } from '../../middlewares/authenticate'
import {
  getRootFoldersHandler,
  getFolderChildrenHandler,
  createFolderHandler,
  renameFolderHandler,
  deleteFolderHandler,
} from './folder.controller'

const router = Router()

// All folder routes require authentication and USER role
// Admins do not have personal file storage — they manage the system only
router.use(authenticate, requireUser)

// GET /api/folders           — list root folders
// GET /api/folders/:id/children — list direct children of a folder
// POST /api/folders          — create a folder (with enforcement)
// PUT /api/folders/:id       — rename a folder
// DELETE /api/folders/:id    — recursively delete folder + all contents

router.get('/', getRootFoldersHandler)
router.get('/:id/children', getFolderChildrenHandler)
router.post('/', ...createFolderHandler)
router.put('/:id', ...renameFolderHandler)
router.delete('/:id', deleteFolderHandler)

export default router