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

export interface AuthResponseDto {
  user: UserDto;
  tokens: AuthTokensDto;
}
