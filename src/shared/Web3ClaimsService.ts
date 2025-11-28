/**
 * Web3 Claims Service
 * 
 * Service for managing Web3 wallet addresses in Firebase user claims.
 * Allows backend verification of wallet ownership and enables blockchain features.
 */

import * as admin from 'firebase-admin';

export interface Web3WalletInfo {
  address: string;
  walletType: 'metamask' | 'walletconnect' | 'keplr' | 'injected';
  chainId?: number;
  ensName?: string;
  verifiedAt?: number;
}

export interface Web3Claims {
  walletAddress?: string; // Primary wallet address (for backward compatibility)
  walletAddresses?: string[]; // Array of wallet addresses
  walletInfo?: Web3WalletInfo[]; // Detailed wallet information
  hasWeb3Wallet?: boolean;
  web3Enabled?: boolean;
  lastWalletSync?: number;
}

export class Web3ClaimsService {
  /**
   * Add or update wallet address in user claims
   * 
   * @param userId Firebase user ID
   * @param walletAddress Wallet address to add
   * @param walletType Type of wallet (metamask, walletconnect, etc.)
   * @param chainId Optional chain ID
   * @param ensName Optional ENS name
   */
  static async addWalletAddress(
    userId: string,
    walletAddress: string,
    walletType: Web3WalletInfo['walletType'] = 'metamask',
    chainId?: number,
    ensName?: string
  ): Promise<void> {
    try {
      if (!admin.apps.length) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      // Normalize wallet address (lowercase)
      const normalizedAddress = walletAddress.toLowerCase();

      // Get current user record
      const user = await admin.auth().getUser(userId);
      const currentClaims = user.customClaims || {};

      // Get existing wallet addresses
      const existingAddresses = currentClaims.walletAddresses || [];
      const existingWalletInfo = currentClaims.walletInfo || [];

      // Check if address already exists
      const addressExists = existingAddresses.some((addr: string) => 
        addr.toLowerCase() === normalizedAddress
      );

      if (!addressExists) {
        // Add new address
        const updatedAddresses = [...existingAddresses, normalizedAddress];
        
        // Add wallet info
        const walletInfo: Web3WalletInfo = {
          address: normalizedAddress,
          walletType,
          chainId,
          ensName,
          verifiedAt: Date.now()
        };
        const updatedWalletInfo = [...existingWalletInfo, walletInfo];

        // Update claims
        const updatedClaims: Web3Claims & Record<string, any> = {
          ...currentClaims,
          walletAddress: normalizedAddress, // Primary address for backward compatibility
          walletAddresses: updatedAddresses,
          walletInfo: updatedWalletInfo,
          hasWeb3Wallet: true,
          web3Enabled: true,
          lastWalletSync: Date.now()
        };

        // Set custom claims
        await admin.auth().setCustomUserClaims(userId, updatedClaims);

        console.log(`✅ [Web3ClaimsService] Wallet address added to user ${userId}:`, {
          address: normalizedAddress,
          walletType,
          totalAddresses: updatedAddresses.length
        });

        // Update user document in Firestore
        await admin.firestore().collection('users').doc(userId).update({
          walletAddress: normalizedAddress,
          walletAddresses: updatedAddresses,
          walletInfo: updatedWalletInfo,
          hasWeb3Wallet: true,
          web3Enabled: true,
          lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Update existing wallet info
        const walletInfoIndex = existingWalletInfo.findIndex(
          (info: Web3WalletInfo) => info.address.toLowerCase() === normalizedAddress
        );

        if (walletInfoIndex >= 0) {
          const updatedWalletInfo = [...existingWalletInfo];
          updatedWalletInfo[walletInfoIndex] = {
            ...updatedWalletInfo[walletInfoIndex],
            walletType,
            chainId: chainId || updatedWalletInfo[walletInfoIndex].chainId,
            ensName: ensName || updatedWalletInfo[walletInfoIndex].ensName,
            verifiedAt: Date.now()
          };

          const updatedClaims: Web3Claims & Record<string, any> = {
            ...currentClaims,
            walletInfo: updatedWalletInfo,
            lastWalletSync: Date.now()
          };

          await admin.auth().setCustomUserClaims(userId, updatedClaims);

          // Update Firestore
          await admin.firestore().collection('users').doc(userId).update({
            walletInfo: updatedWalletInfo,
            lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error(`❌ [Web3ClaimsService] Error adding wallet address:`, error);
      throw error;
    }
  }

  /**
   * Remove wallet address from user claims
   * 
   * @param userId Firebase user ID
   * @param walletAddress Wallet address to remove
   */
  static async removeWalletAddress(
    userId: string,
    walletAddress: string
  ): Promise<void> {
    try {
      if (!admin.apps.length) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Get current user record
      const user = await admin.auth().getUser(userId);
      const currentClaims = user.customClaims || {};

      const existingAddresses = currentClaims.walletAddresses || [];
      const existingWalletInfo = currentClaims.walletInfo || [];

      // Remove address
      const updatedAddresses = existingAddresses.filter(
        (addr: string) => addr.toLowerCase() !== normalizedAddress
      );
      const updatedWalletInfo = existingWalletInfo.filter(
        (info: Web3WalletInfo) => info.address.toLowerCase() !== normalizedAddress
      );

      // Update claims
      const updatedClaims: Web3Claims & Record<string, any> = {
        ...currentClaims,
        walletAddress: updatedAddresses.length > 0 ? updatedAddresses[0] : undefined,
        walletAddresses: updatedAddresses,
        walletInfo: updatedWalletInfo,
        hasWeb3Wallet: updatedAddresses.length > 0,
        web3Enabled: updatedAddresses.length > 0,
        lastWalletSync: Date.now()
      };

      // Remove undefined values
      if (!updatedClaims.walletAddress) {
        delete updatedClaims.walletAddress;
      }

      await admin.auth().setCustomUserClaims(userId, updatedClaims);

      // Update Firestore
      await admin.firestore().collection('users').doc(userId).update({
        walletAddress: updatedAddresses.length > 0 ? updatedAddresses[0] : admin.firestore.FieldValue.delete(),
        walletAddresses: updatedAddresses,
        walletInfo: updatedWalletInfo,
        hasWeb3Wallet: updatedAddresses.length > 0,
        web3Enabled: updatedAddresses.length > 0,
        lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ [Web3ClaimsService] Wallet address removed from user ${userId}`);
    } catch (error) {
      console.error(`❌ [Web3ClaimsService] Error removing wallet address:`, error);
      throw error;
    }
  }

  /**
   * Get wallet addresses from user claims
   * 
   * @param userId Firebase user ID
   * @returns Array of wallet addresses
   */
  static async getWalletAddresses(userId: string): Promise<string[]> {
    try {
      const user = await admin.auth().getUser(userId);
      const claims = user.customClaims || {};
      
      if (claims.walletAddresses && Array.isArray(claims.walletAddresses)) {
        return claims.walletAddresses;
      }
      
      if (claims.walletAddress) {
        return [claims.walletAddress];
      }
      
      return [];
    } catch (error) {
      console.error(`❌ [Web3ClaimsService] Error getting wallet addresses:`, error);
      throw error;
    }
  }

  /**
   * Verify wallet address ownership by checking if address is in user's claims
   * 
   * @param userId Firebase user ID
   * @param walletAddress Wallet address to verify
   * @returns True if address belongs to user
   */
  static async verifyWalletOwnership(
    userId: string,
    walletAddress: string
  ): Promise<boolean> {
    try {
      const addresses = await this.getWalletAddresses(userId);
      const normalizedAddress = walletAddress.toLowerCase();
      
      return addresses.some(addr => addr.toLowerCase() === normalizedAddress);
    } catch (error) {
      console.error(`❌ [Web3ClaimsService] Error verifying wallet ownership:`, error);
      return false;
    }
  }

  /**
   * Sync wallet address from authenticated session
   * This should be called after Web3 authentication to sync wallet to claims
   * 
   * @param userId Firebase user ID
   * @param walletAddress Wallet address from authenticated session
   * @param walletType Type of wallet used
   * @param chainId Current chain ID
   * @param ensName Optional ENS name
   */
  static async syncWalletFromSession(
    userId: string,
    walletAddress: string,
    walletType: Web3WalletInfo['walletType'] = 'metamask',
    chainId?: number,
    ensName?: string
  ): Promise<void> {
    await this.addWalletAddress(userId, walletAddress, walletType, chainId, ensName);
  }

  /**
   * Disable Web3 features for a user
   * 
   * @param userId Firebase user ID
   */
  static async disableWeb3(userId: string): Promise<void> {
    try {
      const user = await admin.auth().getUser(userId);
      const currentClaims = user.customClaims || {};

      const updatedClaims: Web3Claims & Record<string, any> = {
        ...currentClaims,
        web3Enabled: false,
        lastWalletSync: Date.now()
      };

      await admin.auth().setCustomUserClaims(userId, updatedClaims);

      await admin.firestore().collection('users').doc(userId).update({
        web3Enabled: false,
        lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ [Web3ClaimsService] Web3 disabled for user ${userId}`);
    } catch (error) {
      console.error(`❌ [Web3ClaimsService] Error disabling Web3:`, error);
      throw error;
    }
  }
}

