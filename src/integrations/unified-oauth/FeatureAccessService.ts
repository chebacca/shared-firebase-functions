/**
 * Feature Access Service
 * 
 * Ensures all apps have required scopes for their features
 * Provides verification and scope management
 */

import { db } from '../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Feature names used across apps
 */
export type FeatureName =
  | 'file.upload'
  | 'file.download'
  | 'folder.browse'
  | 'file.share'
  | 'docs.create'
  | 'sheets.access'
  | 'send.message'
  | 'create.channel'
  | 'post.channel'
  | 'upload.file'
  | 'calendar.read'
  | 'calendar.write'
  | 'calendar.events'
  | 'meet.create'
  | 'meet.read';

/**
 * Provider names
 */
export type ProviderName = 'google' | 'box' | 'dropbox' | 'slack';

/**
 * App names
 */
export type AppName =
  | 'dashboard'
  | 'clipshow'
  | 'cns'
  | 'callsheet'
  | 'cuesheet'
  | 'timecard'
  | 'iwm'
  | 'addressbook'
  | 'mobile'
  | 'bridge';

/**
 * Feature to scope mapping
 */
const FEATURE_SCOPE_MAP: Record<ProviderName, Record<FeatureName, string[]>> = {
  google: {
    'file.upload': ['https://www.googleapis.com/auth/drive.file'],
    'file.download': ['https://www.googleapis.com/auth/drive.readonly'],
    'folder.browse': ['https://www.googleapis.com/auth/drive.readonly'],
    'docs.create': ['https://www.googleapis.com/auth/documents'],
    'sheets.access': ['https://www.googleapis.com/auth/spreadsheets'],
    'file.share': ['https://www.googleapis.com/auth/drive.file'],
    'calendar.read': ['https://www.googleapis.com/auth/calendar.readonly'],
    'calendar.write': ['https://www.googleapis.com/auth/calendar'],
    'calendar.events': ['https://www.googleapis.com/auth/calendar.events'],
    'meet.create': ['https://www.googleapis.com/auth/meetings.space.created'],
    'meet.read': ['https://www.googleapis.com/auth/meetings.space.readonly'],
    'send.message': [],
    'create.channel': [],
    'post.channel': [],
    'upload.file': []
  },
  box: {
    'file.upload': ['root_readwrite'],
    'file.download': ['root_readonly'],
    'folder.browse': ['root_readonly'],
    'file.share': ['root_readwrite'],
    'docs.create': [],
    'sheets.access': [],
    'send.message': [],
    'create.channel': [],
    'post.channel': [],
    'upload.file': [],
    'calendar.read': [],
    'calendar.write': [],
    'calendar.events': [],
    'meet.create': [],
    'meet.read': []
  },
  dropbox: {
    'file.upload': ['files.content.write', 'files.metadata.write'],
    'file.download': ['files.content.read', 'files.metadata.read'],
    'folder.browse': ['files.metadata.read'],
    'file.share': ['sharing.read', 'sharing.write'],
    'docs.create': [],
    'sheets.access': [],
    'send.message': [],
    'create.channel': [],
    'post.channel': [],
    'upload.file': [],
    'calendar.read': [],
    'calendar.write': [],
    'calendar.events': [],
    'meet.create': [],
    'meet.read': []
  },
  slack: {
    'send.message': ['chat:write', 'users:read', 'users:read.email', 'team:read'],
    'create.channel': ['channels:write', 'groups:write'],
    'post.channel': ['chat:write', 'channels:read', 'groups:read', 'im:read', 'mpim:read', 'users:read', 'users:read.email', 'team:read'],
    'upload.file': ['files:write'],
    'file.upload': [],
    'file.download': [],
    'folder.browse': [],
    'file.share': [],
    'docs.create': [],
    'sheets.access': [],
    'calendar.read': [],
    'calendar.write': [],
    'calendar.events': [],
    'meet.create': [],
    'meet.read': []
  }
};

/**
 * App feature requirements
 */
const APP_FEATURES: Record<AppName, Record<ProviderName, FeatureName[]>> = {
  dashboard: {
    google: ['file.upload', 'file.download', 'folder.browse', 'file.share', 'calendar.read', 'calendar.write', 'calendar.events', 'meet.create', 'meet.read'],
    box: ['file.upload', 'file.download', 'folder.browse', 'file.share'],
    dropbox: ['file.upload', 'file.download', 'folder.browse', 'file.share'],
    slack: ['send.message', 'post.channel']
  },
  clipshow: {
    google: ['file.upload', 'file.download', 'folder.browse', 'docs.create'],
    box: ['file.upload', 'file.download', 'folder.browse'],
    dropbox: ['file.upload', 'file.download', 'folder.browse'],
    slack: ['send.message', 'post.channel']
  },
  cns: {
    google: ['file.upload', 'file.download', 'folder.browse'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  callsheet: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  cuesheet: {
    google: ['file.upload', 'file.download', 'sheets.access'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  timecard: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  iwm: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  addressbook: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  mobile: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  },
  bridge: {
    google: ['file.upload', 'file.download'],
    box: ['file.upload', 'file.download'],
    dropbox: ['file.upload', 'file.download'],
    slack: []
  }
};

/**
 * Feature Access Service
 */
export class FeatureAccessService {
  /**
   * Get required scopes for a specific feature
   */
  static getRequiredScopes(
    provider: ProviderName,
    features: FeatureName[]
  ): string[] {
    const scopeMap = FEATURE_SCOPE_MAP[provider];
    if (!scopeMap) {
      return [];
    }

    const requiredScopes = new Set<string>();

    features.forEach(feature => {
      const scopes = scopeMap[feature] || [];
      scopes.forEach(scope => requiredScopes.add(scope));
    });

    return Array.from(requiredScopes);
  }

  /**
   * Verify connection has required scopes for features
   */
  static async verifyScopes(
    organizationId: string,
    provider: ProviderName,
    features: FeatureName[]
  ): Promise<{ hasAccess: boolean; missingScopes: string[] }> {
    // Get connection
    const connectionDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc(provider)
      .get();

    if (!connectionDoc.exists) {
      return { hasAccess: false, missingScopes: [] };
    }

    const connectionData = connectionDoc.data()!;
    const grantedScopes = connectionData.scopes || [];
    const requiredScopes = this.getRequiredScopes(provider, features);

    const missingScopes = requiredScopes.filter(
      scope => !grantedScopes.includes(scope)
    );

    return {
      hasAccess: missingScopes.length === 0,
      missingScopes
    };
  }

  /**
   * Get all features an app needs from a provider
   */
  static getAppFeatures(appName: AppName, provider: ProviderName): FeatureName[] {
    return APP_FEATURES[appName]?.[provider] || [];
  }

  /**
   * Get union of all scopes needed by all apps for a provider
   * This is what should be requested during OAuth
   */
  static getAllRequiredScopesForProvider(provider: ProviderName): string[] {
    const allScopes = new Set<string>();

    Object.values(APP_FEATURES).forEach(appFeatures => {
      const features = appFeatures[provider] || [];
      const scopes = this.getRequiredScopes(provider, features);
      scopes.forEach(scope => allScopes.add(scope));
    });

    // 🔥 ALWAYS include base scopes for Google (userinfo, etc.)
    if (provider === 'google') {
      allScopes.add('https://www.googleapis.com/auth/userinfo.email');
      allScopes.add('https://www.googleapis.com/auth/userinfo.profile');
    }

    // 🔥 ALWAYS include base scopes for Dropbox (account info)
    if (provider === 'dropbox') {
      allScopes.add('account_info.read');
    }

    return Array.from(allScopes);
  }
}

