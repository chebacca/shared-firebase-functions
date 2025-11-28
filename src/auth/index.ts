// Export all authentication functions
export { loginUser } from './login';
export { registerUser } from './register';
export { 
  verifyEmail, 
  resendVerificationEmail, 
  forgotPassword, 
  resetPassword, 
  checkEmailAvailability,
  validateSession,
  refreshUserClaims,
  getAuthStatus
} from './verify';
export { generateAuthTransferToken } from './generateAuthTransferToken';
export { 
  updateEDLConverterClaims,
  grantEDLConverterAccessToEnterpriseUsers 
} from './updateEDLConverterClaims';
