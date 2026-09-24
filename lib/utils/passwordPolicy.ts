/**
 * Industry-Standard Password & Security Policy
 *
 * Rules:
 * - Super Admin: >= 10 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 * - Store Admin: >= 8 chars, 1 uppercase, 1 lowercase, 1 digit or special character.
 * - Staff (Employee): Flexible initial onboarding (>= 6 chars / DOB / alphanumeric), user can change later.
 */

export type UserRoleType = "super_admin" | "admin" | "staff";

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: "weak" | "fair" | "good" | "strong";
  score: number; // 0 to 4
}

export function validatePasswordPolicy(
  password: string,
  role: UserRoleType = "staff"
): PasswordValidationResult {
  const errors: string[] = [];
  const trimmed = (password || "").trim();

  if (!trimmed) {
    return {
      valid: false,
      errors: ["Password is required."],
      strength: "weak",
      score: 0,
    };
  }

  // Calculate generic password strength
  let score = 0;
  if (trimmed.length >= 6) score++;
  if (trimmed.length >= 8) score++;
  if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) score++;
  if (/[0-9]/.test(trimmed)) score++;
  if (/[^A-Za-z0-9]/.test(trimmed)) score++;

  const strengthMap: ("weak" | "fair" | "good" | "strong")[] = [
    "weak",
    "weak",
    "fair",
    "good",
    "strong",
    "strong",
  ];
  const strength = strengthMap[Math.min(score, 5)];

  // Role-specific enforcement
  if (role === "super_admin") {
    if (trimmed.length < 10) {
      errors.push("Super Admin password must be at least 10 characters long.");
    }
    if (!/[A-Z]/.test(trimmed)) {
      errors.push("Must contain at least one uppercase letter (A-Z).");
    }
    if (!/[a-z]/.test(trimmed)) {
      errors.push("Must contain at least one lowercase letter (a-z).");
    }
    if (!/[0-9]/.test(trimmed)) {
      errors.push("Must contain at least one number (0-9).");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
      errors.push("Must contain at least one special character (!@#$%^&*...).");
    }
  } else if (role === "admin") {
    if (trimmed.length < 8) {
      errors.push("Store Admin password must be at least 8 characters long.");
    }
    if (!/[A-Z]/.test(trimmed)) {
      errors.push("Must contain at least one uppercase letter (A-Z).");
    }
    if (!/[a-z]/.test(trimmed)) {
      errors.push("Must contain at least one lowercase letter (a-z).");
    }
    if (!/[0-9]/.test(trimmed) && !/[^A-Za-z0-9]/.test(trimmed)) {
      errors.push("Must contain at least one number or special character.");
    }
  } else {
    // Staff (Employee) - Flexible (e.g. DOB or 6+ char pin)
    if (trimmed.length < 6) {
      errors.push("Staff password must be at least 6 characters (e.g., DOB or PIN).");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
    score: Math.min(score, 4),
  };
}

/**
 * Validates email format strictly
 */
export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim().toLowerCase());
}
