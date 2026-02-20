import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, getParam } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import logger from '../lib/logger';
import { MAX_FILE_SIZE_MB } from '@alcom/shared';

const router: Router = Router();

// Constants
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024; // 10MB in bytes
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Magic byte signatures for file type validation
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],
  'image/jpeg': [
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe2]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe3]),
    Buffer.from([0xff, 0xd8, 0xff, 0xee]),
    Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
  ],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
};

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// File storage configuration
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const user = (req as any).user;
    const moduleQuery = req.query.module;
    const module = String(Array.isArray(moduleQuery) ? moduleQuery[0] : moduleQuery || 'general');
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const stationId = user?.stationId || 'global';

    const uploadPath = path.join(UPLOAD_DIR, stationId, module, String(year), month);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
  const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    cb(new Error('Only PDF, JPG, and PNG files are allowed'));
    return;
  }

  cb(null, true);
};

// Multer instance
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// Validate magic bytes to prevent extension spoofing
function validateMagicBytes(filePath: string, mimeType: string): boolean {
  const expectedSignatures = MAGIC_BYTES[mimeType];
  if (!expectedSignatures) return false;

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(8);
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  return expectedSignatures.some((sig) => {
    return buffer.subarray(0, sig.length).equals(sig);
  });
}

// Error handling middleware for multer
function handleMulterError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, {
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB`,
        statusCode: 400,
      });
      return;
    }
    sendError(res, { code: 'UPLOAD_ERROR', message: err.message, statusCode: 400 });
    return;
  }

  if (err.message.includes('Only PDF, JPG')) {
    sendError(res, { code: 'INVALID_FILE_TYPE', message: err.message, statusCode: 400 });
    return;
  }

  next(err);
}

// Apply auth middleware
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════
// POST /files/upload — Upload a file
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/upload',
  upload.single('file'),
  handleMulterError,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, { code: 'NO_FILE', message: 'No file provided', statusCode: 400 });
        return;
      }

      const { path: filePath, originalname, mimetype, size, filename } = req.file;

      // Validate magic bytes
      if (!validateMagicBytes(filePath, mimetype)) {
        fs.unlinkSync(filePath);
        sendError(res, { code: 'INVALID_FILE_CONTENT', message: 'File content does not match its extension', statusCode: 400 });
        return;
      }

      // Generate file URL
      const relativePath = path.relative(UPLOAD_DIR, filePath);
      const fileUrl = `/files/${relativePath.replace(/\\/g, '/')}`;

      // Store file metadata in database
      const fileRecord = await prisma.fileUpload.create({
        data: {
          id: filename.replace(/\.[^/.]+$/, ''),
          originalName: originalname,
          mimeType: mimetype,
          size,
          path: filePath,
          url: fileUrl,
          uploadedById: req.user!.userId,
        },
      });

      logger.info(`File uploaded: ${fileRecord.id} by user ${req.user!.userId}`);

      sendSuccess(res, {
        data: {
          id: fileRecord.id,
          fileUrl,
          fileName: originalname,
          fileSize: size,
          mimeType: mimetype,
        },
        statusCode: 201,
      });
    } catch (error) {
      logger.error(`Error uploading file: ${error}`);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to upload file', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /files/:fileId — Serve file with auth check
// ═══════════════════════════════════════════════════════════════════
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = getParam(req, 'fileId');

    const fileRecord = await prisma.fileUpload.findUnique({
      where: { id: fileId },
    });

    if (!fileRecord) {
      sendError(res, { code: 'NOT_FOUND', message: 'File not found', statusCode: 404 });
      return;
    }

    if (!fs.existsSync(fileRecord.path)) {
      sendError(res, { code: 'FILE_MISSING', message: 'File not found on disk', statusCode: 404 });
      return;
    }

    res.setHeader('Content-Type', fileRecord.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileRecord.originalName}"`);
    res.setHeader('Content-Length', fileRecord.size);

    const fileStream = fs.createReadStream(fileRecord.path);
    fileStream.pipe(res);
  } catch (error) {
    logger.error(`Error serving file: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to retrieve file', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /files/path/* — Serve files by path (alternative route)
// ═══════════════════════════════════════════════════════════════════
router.get('/path/*', async (req: Request, res: Response) => {
  try {
    const relativePath = (req.params as any)[0] || '';
    const filePath = path.join(UPLOAD_DIR, relativePath);

    // Security: Prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.normalize(UPLOAD_DIR))) {
      sendError(res, { code: 'FORBIDDEN', message: 'Access denied', statusCode: 403 });
      return;
    }

    if (!fs.existsSync(filePath)) {
      sendError(res, { code: 'NOT_FOUND', message: 'File not found', statusCode: 404 });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error(`Error serving file by path: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to retrieve file', statusCode: 500 });
  }
});

export default router;
