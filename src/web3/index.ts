/**
 * Web3 API Endpoints
 * 
 * HTTP endpoints for Web3 wallet management and blockchain features
 */

import { onRequest, HttpsFunction } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import { Web3ClaimsService } from '../shared/Web3ClaimsService';

const auth = getAuth();

/**
 * Web3 wallet management API endpoint
 * 
 * POST /web3/wallet/add - Add wallet address to user claims
 * POST /web3/wallet/remove - Remove wallet address from user claims
 * GET /web3/wallet/list - Get user's wallet addresses
 * POST /web3/wallet/verify - Verify wallet ownership
 */
export const web3Api: HttpsFunction = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req, res): Promise<void> => {
    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Authentication required'));
        return;
      }

      const token = authHeader.split(' ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const path = req.path.split('/').filter(p => p);
      const action = path[path.length - 1] || req.method.toLowerCase();

      if (req.method === 'POST' && action === 'add') {
        // Add wallet address
        const { walletAddress, walletType, chainId, ensName } = req.body;

        if (!walletAddress) {
          res.status(400).json(createErrorResponse('Wallet address is required'));
          return;
        }

        await Web3ClaimsService.addWalletAddress(
          userId,
          walletAddress,
          walletType || 'metamask',
          chainId,
          ensName
        );

        res.status(200).json(createSuccessResponse({
          walletAddress,
          message: 'Wallet address added successfully'
        }));

      } else if (req.method === 'POST' && action === 'remove') {
        // Remove wallet address
        const { walletAddress } = req.body;

        if (!walletAddress) {
          res.status(400).json(createErrorResponse('Wallet address is required'));
          return;
        }

        await Web3ClaimsService.removeWalletAddress(userId, walletAddress);

        res.status(200).json(createSuccessResponse({
          message: 'Wallet address removed successfully'
        }));

      } else if (req.method === 'GET' && action === 'list') {
        // Get wallet addresses
        const addresses = await Web3ClaimsService.getWalletAddresses(userId);

        res.status(200).json(createSuccessResponse({
          walletAddresses: addresses
        }));

      } else if (req.method === 'POST' && action === 'verify') {
        // Verify wallet ownership
        const { walletAddress } = req.body;

        if (!walletAddress) {
          res.status(400).json(createErrorResponse('Wallet address is required'));
          return;
        }

        const verified = await Web3ClaimsService.verifyWalletOwnership(userId, walletAddress);

        res.status(200).json(createSuccessResponse({
          verified,
          walletAddress
        }));

      } else if (req.method === 'POST' && action === 'sync') {
        // Sync wallet from session (called after Web3 authentication)
        const { walletAddress, walletType, chainId, ensName } = req.body;

        if (!walletAddress) {
          res.status(400).json(createErrorResponse('Wallet address is required'));
          return;
        }

        await Web3ClaimsService.syncWalletFromSession(
          userId,
          walletAddress,
          walletType || 'metamask',
          chainId,
          ensName
        );

        res.status(200).json(createSuccessResponse({
          walletAddress,
          message: 'Wallet synced successfully'
        }));

      } else {
        res.status(405).json(createErrorResponse('Method not allowed'));
      }

    } catch (error) {
      console.error('❌ [WEB3 API] Error:', error);
      res.status(500).json(createErrorResponse(
        'Internal server error',
        error instanceof Error ? error.message : 'Unknown error'
      ));
    }
  }
);

