export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    user_metadata?: Record<string, any>;
  };
}

export interface UserProfileResponse {
  user: {
    id: string;
    email: string;
    [key: string]: any;
  };
}
