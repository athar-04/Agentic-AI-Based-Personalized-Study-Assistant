export type UserRole = 'STUDENT' | 'ADMIN' | 'INSTRUCTOR';

export interface UserDto {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  role: UserRole;
  isEmailVerified: boolean;
  isActive?: boolean;
  createdAt: string;
}

export interface UserPreferencesDto {
  theme: string;
  language: string;
  timezone: string;
  dailyStudyGoalMinutes: number;
  notificationsEnabled: boolean;
  voiceEnabled: boolean;
  highContrastMode: boolean;
  dyslexiaFriendlyMode: boolean;
  fontSize: string;
  screenReaderMode: boolean;
  simplifiedLanguage: boolean;
}

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Login response body. The refresh token is never in the body: it is set as an HttpOnly cookie. */
export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
  scope: 'user' | 'admin';
}

/** Signup never returns a session; the account must be verified first. */
export interface RegisterResponseDto {
  verificationRequired: true;
  email: string;
}
