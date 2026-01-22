/**
 * 🔥 UNIFIED ROLE MAPPING SERVICE
 * Maps Licensing Website Roles (Tier 1) to App-Specific Roles (Tier 2)
 * Validates role assignments and calculates effective permissions
 */

import { LicensingRole, DashboardRole, ClipShowProRole, CallSheetRole, CuesheetRole } from 'shared-firebase-models/role-types';

/**
 * Licensing Role → Available Dashboard Roles Mapping
 * Defines which dashboard roles are available for each licensing role
 */
export const LICENSING_TO_DASHBOARD_MAP: Record<LicensingRole, DashboardRole[]> = {
  [LicensingRole.OWNER]: [
    // Can assign ANY role - include all new roles
    DashboardRole.ADMIN,
    DashboardRole.EXEC,
    DashboardRole.MANAGER,
    DashboardRole.POST_COORDINATOR,
    DashboardRole.POST_SUPERVISOR,
    DashboardRole.PRODUCER,
    DashboardRole.DIRECTOR,
    DashboardRole.EDITOR,
    DashboardRole.ASSISTANT_EDITOR,
    DashboardRole.COLORIST,
    DashboardRole.AUDIO_POST,
    DashboardRole.AUDIO_PRODUCTION,
    DashboardRole.AUDIO_MIXER,
    DashboardRole.SOUND_ENGINEER,
    DashboardRole.GFX_ARTIST,
    DashboardRole.CAMERA_OPERATOR,
    DashboardRole.QC_SPECIALIST,
    DashboardRole.MEDIA_MANAGER,
    DashboardRole.DIT,
    DashboardRole.POST_PRODUCER,
    DashboardRole.LOCATION_MANAGER,
    DashboardRole.PRODUCTION_MANAGER,
    DashboardRole.PRODUCTION_ASSISTANT,
    DashboardRole.POST_PA,
    DashboardRole.VIEWER,
    DashboardRole.GUEST
  ],

  [LicensingRole.ADMIN]: [
    // Management & production leadership roles
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
    DashboardRole.POST_COORDINATOR,
    DashboardRole.POST_SUPERVISOR,
    DashboardRole.PRODUCER,
    DashboardRole.DIRECTOR,
    DashboardRole.EDITOR,
    DashboardRole.MEDIA_MANAGER,
    DashboardRole.QC_SPECIALIST,
    DashboardRole.POST_PRODUCER,
    DashboardRole.PRODUCTION_MANAGER
  ],

  [LicensingRole.MEMBER]: [
    // Crew and technical roles
    DashboardRole.EDITOR,
    DashboardRole.ASSISTANT_EDITOR,
    DashboardRole.COLORIST,
    DashboardRole.AUDIO_POST,
    DashboardRole.AUDIO_PRODUCTION,
    DashboardRole.AUDIO_MIXER,
    DashboardRole.SOUND_ENGINEER,
    DashboardRole.GFX_ARTIST,
    DashboardRole.CAMERA_OPERATOR,
    DashboardRole.QC_SPECIALIST,
    DashboardRole.DIT,
    DashboardRole.POST_PRODUCER,
    DashboardRole.LOCATION_MANAGER,
    DashboardRole.PRODUCTION_ASSISTANT,
    DashboardRole.POST_PA
  ],

  [LicensingRole.ACCOUNTING]: [
    DashboardRole.ADMIN,
    DashboardRole.MANAGER
  ]
};

/**
 * Licensing Role → Available Clip Show Pro Roles Mapping
 * Defines which Clip Show Pro roles are available for each licensing role
 */
export const LICENSING_TO_CLIPSHOW_MAP: Record<LicensingRole, ClipShowProRole[]> = {
  [LicensingRole.OWNER]: [
    ClipShowProRole.PRODUCER,
    ClipShowProRole.SUPERVISING_PRODUCER,
    ClipShowProRole.LICENSING_SPECIALIST
  ],
  [LicensingRole.ADMIN]: [
    ClipShowProRole.PRODUCER,
    ClipShowProRole.LICENSING_SPECIALIST,
    ClipShowProRole.EDITOR
  ],
  [LicensingRole.MEMBER]: [
    ClipShowProRole.EDITOR,
    ClipShowProRole.ASSISTANT_EDITOR,
    ClipShowProRole.WRITER,
    ClipShowProRole.RESEARCHER
  ],
  [LicensingRole.ACCOUNTING]: [
    ClipShowProRole.PRODUCER
  ]
};

/**
 * Licensing Role → Available Call Sheet Roles Mapping
 * Defines which Call Sheet roles are available for each licensing role
 */
export const LICENSING_TO_CALLSHEET_MAP: Record<LicensingRole, CallSheetRole[]> = {
  [LicensingRole.OWNER]: [
    CallSheetRole.ADMIN,
    CallSheetRole.PRODUCER
  ],
  [LicensingRole.ADMIN]: [
    CallSheetRole.ADMIN,
    CallSheetRole.PRODUCER,
    CallSheetRole.COORDINATOR
  ],
  [LicensingRole.MEMBER]: [
    CallSheetRole.PRODUCER,
    CallSheetRole.COORDINATOR,
    CallSheetRole.MEMBER
  ],
  [LicensingRole.ACCOUNTING]: [
    CallSheetRole.ADMIN,
    CallSheetRole.PRODUCER
  ]
};

/**
 * Licensing Role → Available Cuesheet Roles Mapping
 * Defines which Cuesheet roles are available for each licensing role
 * Uses same structure as Clip Show Pro
 */
export const LICENSING_TO_CUESHEET_MAP: Record<LicensingRole, CuesheetRole[]> = {
  [LicensingRole.OWNER]: [
    CuesheetRole.PRODUCER,
    CuesheetRole.SUPERVISING_PRODUCER,
    CuesheetRole.LICENSING_SPECIALIST,
    CuesheetRole.ADMIN
  ],
  [LicensingRole.ADMIN]: [
    CuesheetRole.PRODUCER,
    CuesheetRole.LICENSING_SPECIALIST,
    CuesheetRole.EDITOR,
    CuesheetRole.ADMIN
  ],
  [LicensingRole.MEMBER]: [
    CuesheetRole.EDITOR,
    CuesheetRole.ASSISTANT_EDITOR,
    CuesheetRole.WRITER,
    CuesheetRole.RESEARCHER
  ],
  [LicensingRole.ACCOUNTING]: [
    CuesheetRole.PRODUCER,
    CuesheetRole.ADMIN
  ]
};

/**
 * Role Hierarchy Levels
 * Higher number = higher privilege
 */
// Build ROLE_HIERARCHY using Object.assign to avoid duplicate key issues
const buildRoleHierarchy = (): Record<string, number> => {
  const hierarchy: Record<string, number> = {};

  // Licensing Roles
  hierarchy[`licensing:${LicensingRole.OWNER}`] = 100;
  hierarchy[`licensing:${LicensingRole.ADMIN}`] = 90;
  hierarchy[`licensing:${LicensingRole.MEMBER}`] = 50;
  hierarchy[`licensing:${LicensingRole.ACCOUNTING}`] = 80;

  // Dashboard Roles
  hierarchy[`dashboard:${DashboardRole.ADMIN}`] = 100;
  hierarchy[`dashboard:${DashboardRole.EXEC}`] = 90;
  hierarchy[`dashboard:${DashboardRole.MANAGER}`] = 80;
  hierarchy[`dashboard:${DashboardRole.POST_COORDINATOR}`] = 70;
  hierarchy[`dashboard:${DashboardRole.PRODUCER}`] = 65;
  hierarchy[`dashboard:${DashboardRole.DIRECTOR}`] = 62;
  hierarchy[`dashboard:${DashboardRole.EDITOR}`] = 60;
  hierarchy[`dashboard:${DashboardRole.ASSISTANT_EDITOR}`] = 55;
  hierarchy[`dashboard:${DashboardRole.POST_PRODUCER}`] = 50;
  hierarchy[`dashboard:${DashboardRole.PRODUCTION_ASSISTANT}`] = 40;
  hierarchy[`dashboard:${DashboardRole.VIEWER}`] = 10;

  // Dashboard Roles - NEW additions
  hierarchy[`dashboard:${DashboardRole.POST_SUPERVISOR}`] = 68;
  hierarchy[`dashboard:${DashboardRole.MEDIA_MANAGER}`] = 65;
  hierarchy[`dashboard:${DashboardRole.QC_SPECIALIST}`] = 62;
  hierarchy[`dashboard:${DashboardRole.COLORIST}`] = 60;
  hierarchy[`dashboard:${DashboardRole.AUDIO_MIXER}`] = 60;
  hierarchy[`dashboard:${DashboardRole.AUDIO_POST}`] = 55;
  hierarchy[`dashboard:${DashboardRole.AUDIO_PRODUCTION}`] = 55;
  hierarchy[`dashboard:${DashboardRole.SOUND_ENGINEER}`] = 55;
  hierarchy[`dashboard:${DashboardRole.GFX_ARTIST}`] = 55;
  hierarchy[`dashboard:${DashboardRole.CAMERA_OPERATOR}`] = 55;
  hierarchy[`dashboard:${DashboardRole.DIT}`] = 55;
  hierarchy[`dashboard:${DashboardRole.PRODUCTION_MANAGER}`] = 55;
  hierarchy[`dashboard:${DashboardRole.LOCATION_MANAGER}`] = 50;
  hierarchy[`dashboard:${DashboardRole.POST_PA}`] = 40;
  hierarchy[`dashboard:${DashboardRole.GUEST}`] = 10;

  // Clip Show Pro Roles
  hierarchy[`clipShowPro:${ClipShowProRole.PRODUCER}`] = 70;
  hierarchy[`clipShowPro:${ClipShowProRole.SUPERVISING_PRODUCER}`] = 75;
  hierarchy[`clipShowPro:${ClipShowProRole.SERIES_PRODUCER}`] = 70;
  hierarchy[`clipShowPro:${ClipShowProRole.ASSOCIATE_PRODUCER}`] = 55;
  hierarchy[`clipShowPro:${ClipShowProRole.DIRECTOR}`] = 65;
  hierarchy[`clipShowPro:${ClipShowProRole.EDITOR}`] = 60;
  hierarchy[`clipShowPro:${ClipShowProRole.ASSISTANT_EDITOR}`] = 50;
  hierarchy[`clipShowPro:${ClipShowProRole.WRITER}`] = 55;
  hierarchy[`clipShowPro:${ClipShowProRole.LICENSING_SPECIALIST}`] = 70;
  hierarchy[`clipShowPro:${ClipShowProRole.POST_PRODUCER}`] = 50;
  hierarchy[`clipShowPro:${ClipShowProRole.PRODUCTION_ASSISTANT}`] = 40;

  // Call Sheet Roles
  hierarchy[`callSheet:${CallSheetRole.ADMIN}`] = 100;
  hierarchy[`callSheet:${CallSheetRole.PRODUCER}`] = 70;
  hierarchy[`callSheet:${CallSheetRole.COORDINATOR}`] = 60;
  hierarchy[`callSheet:${CallSheetRole.MEMBER}`] = 50;

  // Cuesheet Roles
  hierarchy[`cuesheet:${CuesheetRole.ADMIN}`] = 100;
  hierarchy[`cuesheet:${CuesheetRole.PRODUCER}`] = 70;
  hierarchy[`cuesheet:${CuesheetRole.SUPERVISING_PRODUCER}`] = 75;
  hierarchy[`cuesheet:${CuesheetRole.SERIES_PRODUCER}`] = 70;
  hierarchy[`cuesheet:${CuesheetRole.ASSOCIATE_PRODUCER}`] = 55;
  hierarchy[`cuesheet:${CuesheetRole.DIRECTOR}`] = 65;
  hierarchy[`cuesheet:${CuesheetRole.EDITOR}`] = 60;
  hierarchy[`cuesheet:${CuesheetRole.ASSISTANT_EDITOR}`] = 50;
  hierarchy[`cuesheet:${CuesheetRole.WRITER}`] = 55;
  hierarchy[`cuesheet:${CuesheetRole.LICENSING_SPECIALIST}`] = 70;
  hierarchy[`cuesheet:${CuesheetRole.POST_PRODUCER}`] = 50;
  hierarchy[`cuesheet:${CuesheetRole.PRODUCTION_ASSISTANT}`] = 40;
  hierarchy[`cuesheet:${CuesheetRole.VIEWER}`] = 10;

  return hierarchy;
};

export const ROLE_HIERARCHY: Record<string, number> = buildRoleHierarchy();

/**
 * Role Mapping Service Class
 */
export class RoleMappingService {
  /**
   * Get available dashboard roles for a licensing role
   */
  static getAvailableDashboardRoles(licensingRole: LicensingRole | string): DashboardRole[] {
    const normalizedRole = this.normalizeLicensingRole(licensingRole);
    return LICENSING_TO_DASHBOARD_MAP[normalizedRole] || [];
  }

  /**
   * Get available Clip Show Pro roles for a licensing role
   */
  static getAvailableClipShowProRoles(licensingRole: LicensingRole | string): ClipShowProRole[] {
    const normalizedRole = this.normalizeLicensingRole(licensingRole);
    return LICENSING_TO_CLIPSHOW_MAP[normalizedRole] || [];
  }

  /**
   * Get available Call Sheet roles for a licensing role
   */
  static getAvailableCallSheetRoles(licensingRole: LicensingRole | string): CallSheetRole[] {
    const normalizedRole = this.normalizeLicensingRole(licensingRole);
    return LICENSING_TO_CALLSHEET_MAP[normalizedRole] || [];
  }

  /**
   * Get available Cuesheet roles for a licensing role
   */
  static getAvailableCuesheetRoles(licensingRole: LicensingRole | string): CuesheetRole[] {
    const normalizedRole = this.normalizeLicensingRole(licensingRole);
    return LICENSING_TO_CUESHEET_MAP[normalizedRole] || [];
  }

  /**
   * Validate if a dashboard role can be assigned to a user with a given licensing role
   */
  static canAssignDashboardRole(
    licensingRole: LicensingRole | string,
    dashboardRole: DashboardRole | string
  ): boolean {
    const availableRoles = this.getAvailableDashboardRoles(licensingRole);
    return availableRoles.includes(dashboardRole as DashboardRole);
  }

  /**
   * Validate if a Clip Show Pro role can be assigned to a user with a given licensing role
   */
  static canAssignClipShowProRole(
    licensingRole: LicensingRole | string,
    clipShowProRole: ClipShowProRole | string
  ): boolean {
    const availableRoles = this.getAvailableClipShowProRoles(licensingRole);
    return availableRoles.includes(clipShowProRole as ClipShowProRole);
  }

  /**
   * Validate if a Call Sheet role can be assigned to a user with a given licensing role
   */
  static canAssignCallSheetRole(
    licensingRole: LicensingRole | string,
    callSheetRole: CallSheetRole | string
  ): boolean {
    const availableRoles = this.getAvailableCallSheetRoles(licensingRole);
    return availableRoles.includes(callSheetRole as CallSheetRole);
  }

  /**
   * Get role hierarchy level
   * Supports both prefixed (e.g., "dashboard:ADMIN") and unprefixed (e.g., "ADMIN") role strings
   */
  static getRoleHierarchy(role: string, appName?: 'dashboard' | 'clipShowPro' | 'callSheet' | 'cuesheet' | 'licensing'): number {
    // If role already has prefix, use it directly
    if (role.includes(':')) {
      return ROLE_HIERARCHY[role] || 0;
    }

    // If appName provided, try with prefix
    if (appName) {
      const prefixed = `${appName}:${role}`;
      if (ROLE_HIERARCHY[prefixed] !== undefined) {
        return ROLE_HIERARCHY[prefixed];
      }
    }

    // Try common prefixes as fallback
    const prefixes = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet', 'licensing'];
    for (const prefix of prefixes) {
      const prefixed = `${prefix}:${role}`;
      if (ROLE_HIERARCHY[prefixed] !== undefined) {
        return ROLE_HIERARCHY[prefixed];
      }
    }

    return 0;
  }

  /**
   * Check if user has a role with sufficient hierarchy level
   */
  static hasMinimumHierarchy(userRole: string, minHierarchy: number): boolean {
    return this.getRoleHierarchy(userRole) >= minHierarchy;
  }

  /**
   * Normalize licensing role string to enum value
   */
  private static normalizeLicensingRole(role: LicensingRole | string): LicensingRole {
    const normalized = String(role).toUpperCase().trim();

    // Handle legacy lowercase values
    if (normalized === 'OWNER' || normalized === 'ORGANIZATION_OWNER') {
      return LicensingRole.OWNER;
    }
    if (normalized === 'ADMIN' || normalized === 'ORG_ADMIN' || normalized === 'ENTERPRISE_ADMIN') {
      return LicensingRole.ADMIN;
    }
    if (normalized === 'MEMBER' || normalized === 'USER' || normalized === 'TEAM_MEMBER') {
      return LicensingRole.MEMBER;
    }
    if (normalized === 'ACCOUNTING' || normalized === 'ACCOUNTANT') {
      return LicensingRole.ACCOUNTING;
    }

    // Default to MEMBER if unknown
    return LicensingRole.MEMBER;
  }

  /**
   * Convert teamMemberRole (lowercase) to LicensingRole (uppercase)
   */
  static convertTeamMemberRoleToLicensingRole(teamMemberRole: string): LicensingRole {
    const normalized = String(teamMemberRole).toLowerCase().trim();

    switch (normalized) {
      case 'owner':
        return LicensingRole.OWNER;
      case 'admin':
        return LicensingRole.ADMIN;
      case 'member':
        return LicensingRole.MEMBER;
      case 'viewer':
        return LicensingRole.MEMBER; // Viewer maps to MEMBER
      case 'accounting':
        return LicensingRole.ACCOUNTING;
      default:
        return LicensingRole.MEMBER;
    }
  }
}

