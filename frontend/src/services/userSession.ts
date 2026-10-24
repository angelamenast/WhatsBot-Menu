// src/services/userSession.ts

export interface UserProfileData {
  adminName: string;
  email: string;
  businessName?: string;
  avatarUrl?: string | null;
}

// Función helper para decodificar la carga útil del token JWT
function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function syncUserSession(): UserProfileData | null {
  const token = localStorage.getItem("auth_token");
  if (!token) return null;

  const decoded = parseJwt(token);
  if (!decoded) return null;

  // Extraer datos desde la estructura estándar de Supabase JWT / user_metadata
  const userMetadata = decoded.user_metadata || {};

  const profileData: UserProfileData = {
    email: decoded.email || userMetadata.email || "",
    adminName:
      userMetadata.full_name ||
      userMetadata.name ||
      userMetadata.adminName ||
      decoded.email?.split("@")[0] ||
      "Usuario",
    businessName:
      userMetadata.business_name || userMetadata.businessName || "Mi Negocio",
    avatarUrl: userMetadata.avatar_url || userMetadata.picture || null,
  };

  // Guardar en localStorage para disponibilidad instantánea entre páginas
  localStorage.setItem("user_profile_data", JSON.stringify(profileData));

  // Notificar globalmente a Sidebar, Navbar y vistas activas
  window.dispatchEvent(
    new CustomEvent("profile-updated", { detail: profileData }),
  );

  return profileData;
}
