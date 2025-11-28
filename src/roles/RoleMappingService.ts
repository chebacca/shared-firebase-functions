/**
 * 🔥 UNIFIED ROLE MAPPING SERVICE
 * Maps Licensing Website Roles (Tier 1) to App-Specific Roles (Tier 2)
 * Validates role assignments and calculates effective permissions
 */


/**
 * Licensing Role → Available Dashboard Roles Mapping
 * Defines which dashboard roles are available for each licensing role
 */
export const LICENSING_TO_DASHBOARD_MAP: Record<LicensingRole, DashboardRole[]> = {
  [LicensingRole.OWNER]: [
    DashboardRole.ADMIN,
    DashboardRole.EXEC,
    DashboardRole.MANAGER
  ],
  [LicensingRole.ADMIN]: [
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
    DashboardRole.POST_COORDINATOR
  ],
  [LicensingRole.MEMBER]: [
    DashboardRole.EDITOR,
    DashboardRole.ASSISTANT_EDITOR,
    DashboardRole.PRODUCER,
    DashboardRole.POST_PRODUCER
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
export const ROLE_HIERARCHY: Record<string, number> = {
  // Licensing Roles
  [LicensingRole.OWNER]: 100,
  [LicensingRole.ADMIN]: 90,
  [LicensingRole.MEMBER]: 50,
  [LicensingRole.ACCOUNTING]: 80,
  
  // Dashboard Roles
  [DashboardRole.ADMIN]: 100,
  [DashboardRole.EXEC]: 90,
  [DashboardRole.MANAGER]: 80,
  [DashboardRole.POST_COORDINATOR]: 70,
  [DashboardRole.PRODUCER]: 65,
  [DashboardRole.DIRECTOR]: 62,
  [DashboardRole.EDITOR]: 60,
  [DashboardRole.ASSISTANT_EDITOR]: 55,
  [DashboardRole.POST_PRODUCER]: 50,
  [DashboardRole.PRODUCTION_ASSISTANT]: 40,
  [DashboardRole.VIEWER]: 10,
  
  // Clip Show Pro Roles
  [ClipShowProRole.PRODUCER]: 70,
  [ClipShowProRole.SUPERVISING_PRODUCER]: 75,
  [ClipShowProRole.SERIES_PRODUCER]: 70,
  [ClipShowProRole.ASSOCIATE_PRODUCER]: 55,
  [ClipShowProRole.DIRECTOR]: 65,
  [ClipShowProRole.EDITOR]: 60,
  [ClipShowProRole.ASSISTANT_EDITOR]: 50,
  [ClipShowProRole.WRITER]: 55,
  [ClipShowProRole.LICENSING_SPECIALIST]: 70,
  [ClipShowProRole.POST_PRODUCER]: 50,
  [ClipShowProRole.PRODUCTION_ASSISTANT]: 40,
  
  // Call Sheet Roles
  [CallSheetRole.ADMIN]: 100,
  [CallSheetRole.PRODUCER]: 70,
  [CallSheetRole.COORDINATOR]: 60,
  [CallSheetRole.MEMBER]: 50,
  
  // Cuesheet Roles (same as Clip Show Pro)
  [CuesheetRole.ADMIN]: 100,
  [CuesheetRole.PRODUCER]: 70,
  [CuesheetRole.SUPERVISING_PRODUCER]: 75,
  [CuesheetRole.SERIES_PRODUCER]: 70,
  [CuesheetRole.ASSOCIATE_PRODUCER]: 55,
  [CuesheetRole.DIRECTOR]: 65,
  [CuesheetRole.EDITOR]: 60,
  [CuesheetRole.ASSISTANT_EDITOR]: 50,
  [CuesheetRole.WRITER]: 55,
  [CuesheetRole.LICENSING_SPECIALIST]: 70,
  [CuesheetRole.POST_PRODUCER]: 50,
  [CuesheetRole.PRODUCTION_ASSISTANT]: 40,
  [CuesheetRole.VIEWER]: 10
};

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
   */
  static getRoleHierarchy(role: string): number {
    return ROLE_HIERARCHY[role] || 0;
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

