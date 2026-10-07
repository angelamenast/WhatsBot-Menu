import { apiFetcher } from "../api/client";
import type {
  LoginDto,
  AuthResponse,
  UserProfileResponse,
} from "../types/auth.types";

const BASE_URL = "http://localhost:3000/auth";

export const authService = {
  // POST /auth/login
  async login(credentials: LoginDto): Promise<AuthResponse> {
    return apiFetcher<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  // GET /auth/me
  async getMe(token: string): Promise<UserProfileResponse> {
    return apiFetcher<UserProfileResponse>("/me", {
      method: "GET",
      token,
    });
  },

  // POST /auth/logout
  async logout(token: string): Promise<{ message: string }> {
    return apiFetcher<{ message: string }>("/logout", {
      method: "POST",
      token,
    });
  },

  // Iniciar flujo OAuth de Google vía NestJS
  loginWithGoogle() {
    window.location.href = `${BASE_URL}/google`;
  },

  async register(email: string, password: string) {
    const response = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Error al registrar usuario");
    return data;
  },
};
