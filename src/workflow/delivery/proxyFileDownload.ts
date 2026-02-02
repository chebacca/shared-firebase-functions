import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import cors from 'cors';

const corsHandler = cors({ origin: true });

/**
 * Proxy File Download Function
 *
 * Fetches a file from a remote URL and streams it back to the client.
 * This is used to bypass CORS restrictions when downloading files from
 * third-party providers (Box, Dropbox, etc.) directly in the browser.
 */
export const proxyFileDownload = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
    return corsHandler(req, res, async () => {
        try {
            // 1. Validate Authentication
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).send('Unauthorized: Missing or invalid token');
                return;
            }

            const token = authHeader.split('Bearer ')[1];
            try {
                await admin.auth().verifyIdToken(token);
            } catch (error) {
                res.status(401).send('Unauthorized: Invalid token');
                return;
            }

            // 2. Validate Request Body
            const { url, fileName, mimeType } = req.body;

            if (!url) {
                res.status(400).send('Missing "url" in request body');
                return;
            }

            console.log(`[proxyFileDownload] Proxying download for: ${fileName || 'unnamed file'} (${url})`);

            // 3. Fetch File from Remote URL
            // Use axios for better stream handling and header control
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                validateStatus: (status) => status >= 200 && status < 300, // Reject 3xx/4xx/5xx
                headers: {
                    'User-Agent': 'Backbone-Production-Workflow-System/1.0',
                    ...(req.headers.range && { 'Range': req.headers.range }) // Forward Range header if present
                }
            });

            // 4. Set Response Headers
            // Forward the content type if available, otherwise fallback
            const contentType = mimeType || response.headers['content-type'] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);

            // Set Content-Disposition to force download if fileName is provided
            if (fileName) {
                // Sanitize filename to prevent header injection
                const sanitizedFileName = fileName.replace(/["\\]/g, '');
                res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
            }

            // Forward Content-Length if available
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }

            // Forward Range-related headers
            if (response.headers['content-range']) {
                res.setHeader('Content-Range', response.headers['content-range']);
                res.status(206); // Partial Content
            }
            if (response.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }

            // 5. Stream Data to Client
            response.data.pipe(res);

            response.data.on('error', (err: any) => {
                console.error('[proxyFileDownload] Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).send('Stream error during download');
                } else {
                    res.end(); // End response if headers already sent
                }
            });

        } catch (error: any) {
            console.error('[proxyFileDownload] Error:', error);
            if (!res.headersSent) {
                const status = error.response?.status || 500;
                const message = error.message || 'Internal Server Error';
                res.status(status).send(`Failed to proxy download: ${message}`);
            }
        }
    });
});
