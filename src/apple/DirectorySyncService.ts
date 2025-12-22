/**
 * Apple Connect Directory Sync Service
 * 
 * Syncs users and groups from Apple Open Directory (LDAP) to Firestore
 */

import { db } from '../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';
import * as ldap from 'ldapjs';
import { getAppleConnectConfig } from './config';

export interface DirectorySyncConfig {
  syncFrequency?: 'manual' | 'hourly' | 'daily';
  fieldMappings?: Record<string, string>;
  groupFilters?: string[];
  roleMappings?: Record<string, string>;
}

export interface SyncResult {
  success: boolean;
  syncedUsers: number;
  syncedGroups: number;
  errors?: string[];
}

/**
 * Create LDAP client connection
 */
async function createLdapClient(config: { ldapUrl: string; ldapBindDn: string; ldapBindPassword: string }): Promise<ldap.Client> {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: config.ldapUrl,
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.bind(config.ldapBindDn, config.ldapBindPassword, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(client);
      }
    });
  });
}

/**
 * Search LDAP directory
 */
function searchLdap(client: ldap.Client, baseDn: string, filter: string, attributes: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    client.search(baseDn, { filter, attributes }, (err, res) => {
      if (err) {
        reject(err);
        return;
      }

      res.on('searchEntry', (entry) => {
        const obj: any = {};
        entry.attributes.forEach((attr) => {
          let values: string[];
          if (Array.isArray(attr.vals)) {
            values = attr.vals.map((v: any) => {
              if (Buffer.isBuffer(v)) {
                return v.toString();
              }
              return String(v);
            });
          } else if (typeof attr.vals === 'string') {
            values = [attr.vals];
          } else {
            values = [String(attr.vals)];
          }
          obj[attr.type] = values.length === 1 ? values[0] : values;
        });
        results.push(obj);
      });

      res.on('error', (err) => {
        reject(err);
      });

      res.on('end', () => {
        resolve(results);
      });
    });
  });
}

/**
 * Sync directory users and groups from Apple Open Directory
 */
export async function syncDirectory(
  organizationId: string,
  config?: DirectorySyncConfig
): Promise<SyncResult> {
  try {
    // Get Apple Connect configuration
    const appleConfig = await getAppleConnectConfig(organizationId);

    if (!appleConfig.ldapUrl || !appleConfig.ldapBindDn || !appleConfig.ldapBindPassword || !appleConfig.ldapBaseDn) {
      throw new Error('LDAP configuration is incomplete');
    }

    // Create LDAP client
    const ldapClient = await createLdapClient({
      ldapUrl: appleConfig.ldapUrl,
      ldapBindDn: appleConfig.ldapBindDn,
      ldapBindPassword: appleConfig.ldapBindPassword,
    });

    const errors: string[] = [];
    let syncedUsers = 0;
    let syncedGroups = 0;

    try {
      // Sync users
      const userFilter = config?.groupFilters && config.groupFilters.length > 0
        ? `(&(objectClass=person)(|${config.groupFilters.map(g => `(memberOf=${g})`).join('')}))`
        : '(objectClass=person)';

      const users = await searchLdap(
        ldapClient,
        appleConfig.ldapBaseDn,
        userFilter,
        ['uid', 'mail', 'cn', 'givenName', 'sn', 'displayName', 'department', 'title', 'memberOf']
      );

      // Map and save users to Firestore teamMembers collection
      for (const user of users) {
        try {
          const email = (user.mail?.[0] || user.mail || '').toLowerCase();
          if (!email) continue;

          // Map LDAP attributes to Firestore fields
          const firstName = user.givenName?.[0] || user.givenName || '';
          const lastName = user.sn?.[0] || user.sn || '';
          const displayName = user.displayName?.[0] || user.displayName || user.cn?.[0] || user.cn || `${firstName} ${lastName}`.trim();
          const department = user.department?.[0] || user.department || '';
          const position = user.title?.[0] || user.title || '';

          // Determine role from group memberships
          const groups = user.memberOf || [];
          let role = 'MEMBER'; // Default role
          
          if (config?.roleMappings) {
            for (const [groupPattern, mappedRole] of Object.entries(config.roleMappings)) {
              if (groups.some((g: string) => g.includes(groupPattern))) {
                role = mappedRole;
                break;
              }
            }
          }

          // Check if user already exists
          const existingUserQuery = await db
            .collection('teamMembers')
            .where('email', '==', email)
            .where('organizationId', '==', organizationId)
            .limit(1)
            .get();

          const userData: any = {
            email,
            firstName,
            lastName,
            displayName,
            department,
            position,
            role,
            organizationId,
            appleConnect: true, // Mark as synced from Apple Connect
            syncedFrom: 'apple_connect',
            syncedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          };

          if (existingUserQuery.empty) {
            // Create new user
            await db.collection('teamMembers').add(userData);
            syncedUsers++;
          } else {
            // Update existing user
            const existingDoc = existingUserQuery.docs[0];
            await existingDoc.ref.update({
              ...userData,
              createdAt: existingDoc.data().createdAt || Timestamp.now(),
            });
            syncedUsers++;
          }
        } catch (userError) {
          const errorMsg = `Failed to sync user ${user.uid || user.mail}: ${userError instanceof Error ? userError.message : String(userError)}`;
          errors.push(errorMsg);
          console.error(`❌ [DirectorySync] ${errorMsg}`);
        }
      }

      // Sync groups (optional - for role mapping)
      const groups = await searchLdap(
        ldapClient,
        appleConfig.ldapBaseDn,
        '(objectClass=group)',
        ['cn', 'member', 'description']
      );

      // Store group information for role mapping
      for (const group of groups) {
        try {
          const groupName = group.cn?.[0] || group.cn || '';
          if (!groupName) continue;

          // Store group info (can be used for role mapping)
          const groupRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('appleConnectGroups')
            .doc(groupName);

          await groupRef.set({
            name: groupName,
            description: group.description?.[0] || group.description || '',
            members: group.member || [],
            syncedAt: Timestamp.now(),
          }, { merge: true });

          syncedGroups++;
        } catch (groupError) {
          const errorMsg = `Failed to sync group ${group.cn}: ${groupError instanceof Error ? groupError.message : String(groupError)}`;
          errors.push(errorMsg);
          console.error(`❌ [DirectorySync] ${errorMsg}`);
        }
      }

      // Unbind LDAP client
      ldapClient.unbind();

      return {
        success: errors.length === 0,
        syncedUsers,
        syncedGroups,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (syncError) {
      ldapClient.unbind();
      throw syncError;
    }

  } catch (error) {
    console.error('❌ [DirectorySync] Error syncing directory:', error);
    throw error;
  }
}

