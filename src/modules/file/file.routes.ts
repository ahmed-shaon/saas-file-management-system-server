import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, requireUser } from '../../middlewares/authenticate'
import { uploadRateLimiter } from '../../middlewares/rateLimiter'
import {
  getFilesInFolder,
  uploadFile,
  downloadFile,
  renameFileHandler,
  deleteFile,
} from './file.controller'
import { env } from '../../config/env'

const router = Router()

// Multer — Stage 1 of two-stage upload.
// Responsibility: absolute size ceiling + temp storage + UUID filename.
// Business rules (package limits) are enforced in Stage 2 by EnforcementService.
const tempStorage = multer.diskStorage({
  destination: path.join(process.cwd(), env.UPLOAD_DIR, 'temp'),
  filename: (_req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: tempStorage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
})

router.use(authenticate, requireUser)

router.get('/folder/:folderId', getFilesInFolder)
router.post('/upload', uploadRateLimiter, upload.single('file'), uploadFile)
router.get('/:id/download', downloadFile)
router.put('/:id/rename', ...renameFileHandler)
router.delete('/:id', deleteFile)

export default router