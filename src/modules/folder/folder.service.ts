import { prisma } from '../../config/database'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'

// ─────────────────────────────────────────────
// GET ROOT FOLDERS
// Returns all top-level folders for the user (parentId = null).
// Each folder includes _count for children and files so the
// frontend can show folder indicators without extra requests.
// ─────────────────────────────────────────────

export const getRootFolders = async (userId: string) => {
  return prisma.folder.findMany({
    where: {
      userId,
      parentId: null,
    },
    include: {
      _count: {
        select: {
          children: true,
          files: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

// ─────────────────────────────────────────────
// GET FOLDER CHILDREN
// Returns direct children of a given folder.
// Verifies ownership before returning — 404 if not found or wrong user.
// ─────────────────────────────────────────────

export const getFolderChildren = async (userId: string, folderId: string) => {
  // Verify the parent folder exists and belongs to this user
  const parentFolder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  })

  // 404 not 403 — don't confirm the folder exists to other users
  if (!parentFolder || parentFolder.userId !== userId) {
    throw new ApiError(
      404,
      'Folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  return prisma.folder.findMany({
    where: {
      userId,
      parentId: folderId,
    },
    include: {
      _count: {
        select: {
          children: true,
          files: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

// ─────────────────────────────────────────────
// CREATE FOLDER
// Called AFTER checkFolderCreateAllowed passes.
// Computes depthLevel from parent — never trusts client input.
// Checks for duplicate name in same parent before inserting.
// ─────────────────────────────────────────────

export const createFolder = async (
  userId: string,
  name: string,
  parentId: string | null
) => {
  // Compute depthLevel server-side
  let depthLevel = 1 // root folder default

  if (parentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: parentId },
      select: { depthLevel: true, userId: true },
    })

    // Should not happen — enforcement already checked — but guard anyway
    if (!parentFolder || parentFolder.userId !== userId) {
      throw new ApiError(
        404,
        'Parent folder not found.',
        undefined,
        ERROR_CODES.NOT_FOUND
      )
    }

    depthLevel = parentFolder.depthLevel + 1
  }

  // Duplicate check + create wrapped in a transaction to prevent race
  // condition between checking and inserting. Without this, two concurrent
  // requests could both pass the check and both insert, producing duplicate
  // folder names in the same location.
  return prisma.$transaction(async (tx) => {
    const existingFolder = await tx.folder.findFirst({
      where: { userId, parentId, name },
    })

    if (existingFolder) {
      throw new ApiError(
        409,
        `A folder named "${name}" already exists in this location.`,
        undefined,
        ERROR_CODES.DUPLICATE_ENTRY
      )
    }

    return tx.folder.create({
      data: { name, userId, parentId, depthLevel },
      include: {
        _count: {
          select: { children: true, files: true },
        },
      },
    })
  })
}

// ─────────────────────────────────────────────
// RENAME FOLDER
// Only the name changes — parent and depth stay the same.
// Verifies ownership, checks for duplicate name in same parent.
// ─────────────────────────────────────────────

export const renameFolder = async (
  userId: string,
  folderId: string,
  name: string
) => {
  // Verify ownership
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true, parentId: true, name: true },
  })

  if (!folder || folder.userId !== userId) {
    throw new ApiError(
      404,
      'Folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // No-op — renaming to the same name, just return current state without a DB write
  // We already fetched and verified the folder exists above, so findUniqueOrThrow
  // is safe here and guarantees a non-null return to the controller.
  if (folder.name === name) {
    return prisma.folder.findUniqueOrThrow({
      where: { id: folderId },
      include: {
        _count: { select: { children: true, files: true } },
      },
    })
  }

  // Duplicate name check in same parent scope
  const existingFolder = await prisma.folder.findFirst({
    where: {
      userId,
      parentId: folder.parentId,
      name,
      NOT: { id: folderId }, // exclude the current folder itself
    },
  })

  if (existingFolder) {
    throw new ApiError(
      409,
      `A folder named "${name}" already exists in this location.`,
      undefined,
      ERROR_CODES.DUPLICATE_ENTRY
    )
  }

  return prisma.folder.update({
    where: { id: folderId },
    data: { name },
    include: {
      _count: { select: { children: true, files: true } },
    },
  })
}

// ─────────────────────────────────────────────
// DELETE FOLDER (recursive)
// Deletes the target folder and ALL its descendants recursively.
// Physical files on disk are handled by the controller — this
// service only returns the storedNames of files that need deletion
// so the controller can clean up disk after the DB transaction.
//
// Order to avoid FK violations:
//   1. Collect all descendant folder IDs via recursive traversal
//   2. Collect all file storedNames in those folders + the target
//   3. Delete files from DB (FK children before parents)
//   4. Delete folders bottom-up (leaves first, then target)
//   All inside one transaction.
//
// Returns: array of storedName strings for disk cleanup
// ─────────────────────────────────────────────

export const deleteFolderWithContents = async (
  userId: string,
  folderId: string
): Promise<string[]> => {
  // Verify ownership of the target folder
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  })

  if (!folder || folder.userId !== userId) {
    throw new ApiError(
      404,
      'Folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // ── Step 1: Collect all descendant folder IDs recursively ──
  // We do this outside the transaction — read-only traversal.
  // This avoids holding a write lock during the traversal.
  const descendants = await collectDescendantFolderIds(folderId, userId)

  // Put the target folder FIRST so that after reversing for deletion,
  // it ends up LAST — children are deleted before their parent.
  // BFS gives us [level1, level2, level3...], prepending target gives
  // [target, level1, level2, level3]. Reversed: [level3, level2, level1, target].
  // This satisfies the onDelete: NoAction constraint on the self-relation.
  const allFolderIds = [folderId, ...descendants]

  // ── Step 2: Collect storedNames of all files to delete from disk ──
  const filesToDelete = await prisma.file.findMany({
    where: {
      folderId: { in: allFolderIds },
      userId,
    },
    select: { storedName: true },
  })

  const storedNames = filesToDelete.map((f) => f.storedName)

  // ── Step 3 + 4: Delete everything in a transaction ──
  await prisma.$transaction(async (tx) => {
    // Delete all file records first (FK: files reference folders)
    await tx.file.deleteMany({
      where: {
        folderId: { in: allFolderIds },
        userId,
      },
    })

    // Delete all folders. Because parent Folder uses onDelete: NoAction
    // on the self-relation, we must delete children before parents.
    // We collected IDs in BFS order (root first) so reverse for deletion.
    const deletionOrder = [...allFolderIds].reverse()

    for (const id of deletionOrder) {
      await tx.folder.delete({ where: { id } })
    }
  })

  return storedNames
}

// ─────────────────────────────────────────────
// INTERNAL HELPER — collectDescendantFolderIds
// Recursively collects all descendant folder IDs using BFS.
// Does NOT include the target folder itself — caller adds it.
//
// Why BFS instead of recursive CTE:
// Prisma does not natively support recursive CTEs.
// For typical nesting depths (max 10 per Diamond plan) BFS
// is clean and has acceptable DB round trips.
// ─────────────────────────────────────────────

const collectDescendantFolderIds = async (
  folderId: string,
  userId: string
): Promise<string[]> => {
  const descendants: string[] = []
  const queue: string[] = [folderId]

  while (queue.length > 0) {
    const currentId = queue.shift()!

    const children = await prisma.folder.findMany({
      where: { parentId: currentId, userId },
      select: { id: true },
    })

    for (const child of children) {
      descendants.push(child.id)
      queue.push(child.id)
    }
  }

  return descendants
}