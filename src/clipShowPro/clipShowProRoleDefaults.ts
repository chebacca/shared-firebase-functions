/**
 * Clip Show Pro Role Defaults Configuration
 * 
 * Centralized configuration for default permissions, hierarchy, and claims
 * for all Clip Show Pro user roles.
 * 
 * This ensures all user types have proper claims to access the app.
 */

export type ClipShowProRole =
  | 'ADMIN' | 'SUPERADMIN' | 'OWNER'
  | 'PRODUCER' | 'ASSOCIATE_PRODUCER' | 'SERIES_PRODUCER' | 'SUPERVISING_PRODUCER'
  | 'DIRECTOR'
  | 'WRITER'
  | 'EDITOR' | 'ASSISTANT_EDITOR' | 'ASSEMBLY_EDITOR' | 'POST_SUPERVISOR' | 'POST_COORDINATOR'
  | 'TALENT'
  | 'CREW'
  | 'CLIENT'
  | 'MEMBER'
  | 'VENDOR' | 'LICENSING_SPECIALIST'
  | 'LEGAL'
  | 'CONTACT';

export type PageId =
  | 'projects' | 'pitching' | 'clearance' | 'stories' | 'scripts' | 'edit'
  | 'clips-budget-tracker' | 'contacts' | 'messages' | 'calendar'
  | 'shows-management' | 'converter' | 'budget' | 'cuesheets' | 'indexed-files';

export interface PagePermission {
  read: boolean;
  write: boolean;
}

export interface RoleDefaults {
  hierarchy: number;
  permissions: string[];
  pagePermissions: Record<PageId, PagePermission>;
}

/**
 * Default page permissions for all Clip Show Pro pages
 */
const ALL_PAGES: PageId[] = [
  'projects',
  'pitching',
  'clearance',
  'stories',
  'scripts',
  'edit',
  'clips-budget-tracker',
  'contacts',
  'messages',
  'calendar',
  'shows-management',
  'converter',
  'budget',
  'cuesheets',
  'indexed-files',
];

/**
 * Helper to create full read/write permissions for all pages
 */
function allPagesFullAccess(): Record<PageId, PagePermission> {
  const result: Record<PageId, PagePermission> = {} as any;
  for (const page of ALL_PAGES) {
    result[page] = { read: true, write: true };
  }
  return result;
}

/**
 * Helper to create read-only permissions for all pages
 */
function allPagesReadOnly(): Record<PageId, PagePermission> {
  const result: Record<PageId, PagePermission> = {} as any;
  for (const page of ALL_PAGES) {
    result[page] = { read: true, write: false };
  }
  return result;
}

/**
 * Helper to create no access permissions for all pages
 */
function allPagesNoAccess(): Record<PageId, PagePermission> {
  const result: Record<PageId, PagePermission> = {} as any;
  for (const page of ALL_PAGES) {
    result[page] = { read: false, write: false };
  }
  return result;
}

/**
 * Helper to create selective page permissions
 */
function selectivePages(
  readWritePages: PageId[],
  readOnlyPages: PageId[],
  noAccessPages: PageId[] = []
): Record<PageId, PagePermission> {
  const result: Record<PageId, PagePermission> = {} as any;

  for (const page of ALL_PAGES) {
    if (readWritePages.includes(page)) {
      result[page] = { read: true, write: true };
    } else if (readOnlyPages.includes(page)) {
      result[page] = { read: true, write: false };
    } else if (noAccessPages.includes(page)) {
      result[page] = { read: false, write: false };
    } else {
      result[page] = { read: false, write: false };
    }
  }

  return result;
}

/**
 * Role-based default permissions configuration
 */
export const CLIPSHOWPRO_ROLE_DEFAULTS: Record<ClipShowProRole, RoleDefaults> = {
  // Administrative Roles - Full Access
  ADMIN: {
    hierarchy: 100,
    permissions: ['admin:all', 'read:all', 'write:all', 'delete:all', 'manage:users', 'manage:organization'],
    pagePermissions: allPagesFullAccess(),
  },
  SUPERADMIN: {
    hierarchy: 100,
    permissions: ['admin:all', 'read:all', 'write:all', 'delete:all', 'manage:users', 'manage:organization', 'superadmin:all'],
    pagePermissions: allPagesFullAccess(),
  },
  OWNER: {
    hierarchy: 100,
    permissions: ['admin:all', 'read:all', 'write:all', 'delete:all', 'manage:users', 'manage:organization', 'owner:all'],
    pagePermissions: allPagesFullAccess(),
  },

  // Production Roles - High Access
  PRODUCER: {
    hierarchy: 50,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:contacts', 'write:contacts'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'contacts', 'calendar', 'shows-management', 'messages'],
      ['clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  SUPERVISING_PRODUCER: {
    hierarchy: 50,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:contacts', 'write:contacts'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'contacts', 'calendar', 'shows-management', 'messages'],
      ['clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  SERIES_PRODUCER: {
    hierarchy: 50,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:contacts'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'contacts', 'calendar', 'shows-management', 'messages'],
      ['clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  ASSOCIATE_PRODUCER: {
    hierarchy: 45,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:contacts'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'contacts', 'calendar', 'messages'],
      ['edit', 'clips-budget-tracker', 'shows-management', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Creative Roles
  DIRECTOR: {
    hierarchy: 45,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:edit', 'write:edit'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'calendar', 'messages'],
      ['contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  WRITER: {
    hierarchy: 40,
    permissions: ['read:pitching', 'write:pitching', 'read:stories', 'write:stories', 'read:projects'],
    pagePermissions: selectivePages(
      ['pitching', 'clearance', 'stories', 'scripts'],
      ['projects', 'edit', 'messages', 'calendar'],
      ['contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Editorial Roles
  EDITOR: {
    hierarchy: 35,
    permissions: ['read:stories', 'write:stories', 'read:edit', 'write:edit', 'read:projects'],
    pagePermissions: selectivePages(
      ['stories', 'scripts', 'edit'],
      ['projects', 'pitching', 'clearance', 'messages', 'calendar'],
      ['contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  ASSISTANT_EDITOR: {
    hierarchy: 32,
    permissions: ['read:stories', 'write:stories', 'read:edit', 'write:edit'],
    pagePermissions: selectivePages(
      ['stories', 'scripts', 'edit'],
      ['projects', 'messages', 'calendar'],
      ['pitching', 'clearance', 'contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  ASSEMBLY_EDITOR: {
    hierarchy: 30,
    permissions: ['read:stories', 'read:edit', 'write:edit'],
    pagePermissions: selectivePages(
      ['edit'],
      ['stories', 'scripts', 'projects', 'messages'],
      ['pitching', 'clearance', 'contacts', 'shows-management', 'clips-budget-tracker', 'calendar', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  POST_SUPERVISOR: {
    hierarchy: 35,
    permissions: ['read:stories', 'write:stories', 'read:edit', 'write:edit', 'read:projects'],
    pagePermissions: selectivePages(
      ['stories', 'scripts', 'edit'],
      ['projects', 'pitching', 'clearance', 'messages', 'calendar'],
      ['contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  POST_COORDINATOR: {
    hierarchy: 30,
    permissions: ['read:stories', 'read:edit', 'read:projects'],
    pagePermissions: selectivePages(
      [],
      ['stories', 'scripts', 'edit', 'projects', 'messages', 'calendar'],
      ['pitching', 'clearance', 'contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Talent & Crew
  TALENT: {
    hierarchy: 30,
    permissions: ['read:stories', 'read:calendar'],
    pagePermissions: selectivePages(
      [],
      ['stories', 'scripts', 'calendar', 'messages'],
      ['projects', 'pitching', 'clearance', 'edit', 'contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  CREW: {
    hierarchy: 25,
    permissions: ['read:projects', 'read:calendar'],
    pagePermissions: selectivePages(
      [],
      ['projects', 'calendar', 'messages'],
      ['pitching', 'clearance', 'stories', 'scripts', 'edit', 'contacts', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Business Roles
  CLIENT: {
    hierarchy: 30,
    permissions: ['read:projects', 'read:pitching', 'read:stories'],
    pagePermissions: selectivePages(
      [],
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'messages'],
      ['edit', 'contacts', 'shows-management', 'clips-budget-tracker', 'calendar', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  VENDOR: {
    hierarchy: 20,
    permissions: ['read:contacts', 'read:calendar'],
    pagePermissions: selectivePages(
      [],
      ['contacts', 'calendar', 'messages'],
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  LICENSING_SPECIALIST: {
    hierarchy: 35,
    permissions: ['read:pitching', 'write:pitching', 'read:clips-budget-tracker', 'write:clips-budget-tracker', 'read:contacts'],
    pagePermissions: selectivePages(
      ['pitching', 'clearance', 'clips-budget-tracker'],
      ['projects', 'stories', 'scripts', 'contacts', 'messages', 'calendar'],
      ['edit', 'shows-management', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
  LEGAL: {
    hierarchy: 30,
    permissions: ['read:pitching', 'read:stories', 'read:contacts', 'read:messages'],
    pagePermissions: selectivePages(
      [],
      ['pitching', 'clearance', 'stories', 'scripts', 'contacts', 'messages'],
      ['projects', 'edit', 'shows-management', 'clips-budget-tracker', 'calendar', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Standard Team Member
  MEMBER: {
    hierarchy: 50,
    permissions: ['read:projects', 'write:projects', 'read:pitching', 'read:stories', 'read:contacts'],
    pagePermissions: selectivePages(
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'contacts', 'calendar', 'messages'],
      ['edit', 'shows-management', 'clips-budget-tracker', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },

  // Default/Other
  CONTACT: {
    hierarchy: 20,
    permissions: ['read:contacts'],
    pagePermissions: selectivePages(
      [],
      ['contacts', 'messages'],
      ['projects', 'pitching', 'clearance', 'stories', 'scripts', 'edit', 'shows-management', 'clips-budget-tracker', 'calendar', 'converter', 'budget', 'cuesheets', 'indexed-files']
    ),
  },
};

/**
 * Get default configuration for a role
 */
export function getRoleDefaults(role: string): RoleDefaults {
  const normalizedRole = role.toUpperCase().replace(/-/g, '_') as ClipShowProRole;
  return CLIPSHOWPRO_ROLE_DEFAULTS[normalizedRole] || CLIPSHOWPRO_ROLE_DEFAULTS.CONTACT;
}

/**
 * Map contact role to Clip Show Pro role
 */
export function mapContactRoleToClipShowRole(contactRole: string): ClipShowProRole {
  const roleMapping: Record<string, ClipShowProRole> = {
    'producer': 'PRODUCER',
    'supervising-producer': 'SUPERVISING_PRODUCER',
    'series-producer': 'SERIES_PRODUCER',
    'associate-producer': 'ASSOCIATE_PRODUCER',
    'director': 'DIRECTOR',
    'writer': 'WRITER',
    'editor': 'EDITOR',
    'assistant-editor': 'ASSISTANT_EDITOR',
    'assembly-editor': 'ASSEMBLY_EDITOR',
    'post-supervisor': 'POST_SUPERVISOR',
    'post-coordinator': 'POST_COORDINATOR',
    'talent': 'TALENT',
    'crew': 'CREW',
    'client': 'CLIENT',
    'vendor': 'VENDOR',
    'licensing_specialist': 'LICENSING_SPECIALIST',
    'licensing-specialist': 'LICENSING_SPECIALIST',
    'legal': 'LEGAL',
    'admin': 'ADMIN',
    'member': 'MEMBER',
    'other': 'CONTACT',
  };

  const normalized = contactRole.toLowerCase().replace(/_/g, '-');
  return roleMapping[normalized] || 'CONTACT';
}


