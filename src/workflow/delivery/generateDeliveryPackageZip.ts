/**
 * Generate Delivery Package ZIP
 * 
 * Firebase Function to generate ZIP packages server-side for large files
 * 
 * Note: Requires adm-zip package: npm install adm-zip @types/adm-zip
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as https from 'https';
import * as http from 'http';
import { createWriteStream, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Try to load adm-zip (will fail gracefully if not installed)
let AdmZip: any;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  console.warn('[generateDeliveryPackageZip] adm-zip not installed. Install with: npm install adm-zip @types/adm-zip');
}

interface GenerateZipRequest {
  packageData: {
    packageInfo: {
      packageName: string;
      version: string;
      description?: string;
    };
    selectedFiles: Array<{
      id: string;
      fileName: string;
      fileUrl?: string;
      filePath?: string;
      fileSize?: number;
      mimeType?: string;
      deliveryAlias?: string;
      folderPath?: string;
      sourceStepName?: string;
    }>;
    fileOrganization?: {
      groupBy?: string;
      folders?: Array<{
        name: string;
        files: string[];
      }>;
    };
  };
  sessionName: string;
}

/**
 * Download file from URL
 */
async function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(filePath);

    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        unlinkSync(filePath);
        reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      try {
        unlinkSync(filePath);
      } catch (e) {
        // Ignore cleanup errors
      }
      reject(err);
    });
  });
}

/**
 * Get file path for ZIP based on organization
 */
function getFilePathForZip(
  file: any,
  fileOrganization?: any
): string {
  // Check if file has custom folder path
  if (file.folderPath) {
    return `${file.folderPath}/${file.deliveryAlias || file.fileName}`;
  }

  // Check file organization folders
  if (fileOrganization?.folders && fileOrganization.folders.length > 0) {
    const folder = fileOrganization.folders.find((f: any) =>
      f.files && f.files.includes(file.id)
    );
    if (folder) {
      return `${folder.name}/${file.deliveryAlias || file.fileName}`;
    }
  }

  // Group by workflow step if configured
  if (fileOrganization?.groupBy === 'workflow-step' && file.sourceStepName) {
    return `${file.sourceStepName}/${file.deliveryAlias || file.fileName}`;
  }

  // Default: use delivery alias or file name
  return file.deliveryAlias || file.fileName;
}

/**
 * Generate delivery package ZIP server-side
 */
export const generateDeliveryPackageZip = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to generate delivery packages'
      );
    }

    // Check if adm-zip is available
    if (!AdmZip) {
      throw new HttpsError(
        'failed-precondition',
        'Server-side ZIP generation requires adm-zip package. Please install: npm install adm-zip @types/adm-zip in the functions directory.'
      );
    }

    try {
      const data = request.data as GenerateZipRequest;
      const { packageData, sessionName } = data;

      if (!packageData || !packageData.selectedFiles || packageData.selectedFiles.length === 0) {
        throw new HttpsError(
          'invalid-argument',
          'Package data and files are required'
        );
      }

      // Create temporary directory for ZIP generation
      const tempDir = tmpdir();
      const zipFileName = `${packageData.packageInfo.packageName || 'delivery-package'}-${packageData.packageInfo.version || '1.0.0'}.zip`;
      const zipFilePath = join(tempDir, zipFileName);

      // Create ZIP archive
      const zip = new AdmZip();

      // Create manifest
      const manifest = {
        packageName: packageData.packageInfo.packageName,
        version: packageData.packageInfo.version,
        sessionName,
        createdAt: new Date().toISOString(),
        description: packageData.packageInfo.description,
        files: packageData.selectedFiles.map(f => ({
          fileName: f.deliveryAlias || f.fileName,
          originalFileName: f.fileName,
          fileSize: f.fileSize,
          mimeType: f.mimeType
        }))
      };

      // Add manifest to ZIP
      zip.addFile('MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2)));

      // Download and add files
      for (const file of packageData.selectedFiles) {
        if (!file.fileUrl) {
          console.warn(`[generateDeliveryPackageZip] File ${file.fileName} has no URL, adding placeholder`);
          const zipPath = getFilePathForZip(file, packageData.fileOrganization);
          zip.addFile(zipPath, Buffer.from(`[File not accessible: ${file.fileName}]\nReason: No file URL available`));
          continue;
        }

        try {
          const tempFilePath = join(tempDir, `file-${file.id}-${Date.now()}`);
          await downloadFile(file.fileUrl, tempFilePath);

          const fileBuffer = readFileSync(tempFilePath);
          const zipPath = getFilePathForZip(file, packageData.fileOrganization);
          zip.addFile(zipPath, fileBuffer);

          // Clean up temp file
          try {
            unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.warn('[generateDeliveryPackageZip] Failed to cleanup temp file:', cleanupError);
          }
        } catch (error) {
          console.error(`[generateDeliveryPackageZip] Error downloading file ${file.fileName}:`, error);
          const zipPath = getFilePathForZip(file, packageData.fileOrganization);
          zip.addFile(zipPath, Buffer.from(`[File not accessible: ${file.fileName}]\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }

      // Write ZIP to file
      zip.writeZip(zipFilePath);

      // Upload ZIP to Firebase Storage
      const bucket = admin.storage().bucket();
      const organizationId = (request.auth.token as any).organizationId || 'default';
      const storagePath = `delivery-packages/${organizationId}/${Date.now()}-${zipFileName}`;
      const storageFile = bucket.file(storagePath);

      // Read ZIP file and upload
      const zipBuffer = readFileSync(zipFilePath);
      await storageFile.save(zipBuffer, {
        metadata: {
          contentType: 'application/zip',
          metadata: {
            packageName: packageData.packageInfo.packageName,
            version: packageData.packageInfo.version,
            sessionName: sessionName,
            generatedAt: new Date().toISOString()
          }
        }
      });

      // Make file publicly accessible and get download URL
      await storageFile.makePublic();
      const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      // Clean up temporary ZIP file
      try {
        unlinkSync(zipFilePath);
      } catch (cleanupError) {
        console.warn('[generateDeliveryPackageZip] Failed to cleanup temp ZIP file:', cleanupError);
      }

      return { downloadUrl };
    } catch (error) {
      console.error('[generateDeliveryPackageZip] Error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to generate delivery package ZIP'
      );
    }
  });
