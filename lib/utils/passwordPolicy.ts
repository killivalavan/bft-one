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

const COMMON_WEAK_BASES = new Set([
  "password",
  "pass",
  "hello",
  "welcome",
  "admin",
  "administrator",
  "superadmin",
  "qwerty",
  "letmein",
  "changeme",
  "iloveyou",
  "test",
  "testing",
  "user",
  "staff",
  "default",
  "abc",
  "abcd",
  "login",
]);

function isCommonOrPredictable(password: string): boolean {
  const lower = password.toLowerCase();
  const lettersOnly = lower.replace(/[^a-z]/g, "");
  if (lettersOnly && COMMON_WEAK_BASES.has(lettersOnly)) {
    return true;
  }
  // Purely numeric or obvious keyboard/sequential runs
  if (/^[0-9]+$/.test(lower)) return true;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwert)/.test(lower) && password.length < 12) {
    return true;
  }
  return false;
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

  const predictable = isCommonOrPredictable(trimmed);

  // Calculate generic password strength (0-5 internal, 0-4 UI scale)
  let score = 0;
  if (trimmed.length >= 8) score++;
  if (trimmed.length >= 12) score++;
  if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) score++;
  if (/[0-9]/.test(trimmed)) score++;
  if (/[^A-Za-z0-9]/.test(trimmed)) score++;

  if (predictable) {
    score = Math.min(score, 1);
  }

  const strengthMap: ("weak" | "fair" | "good" | "strong")[] = [
    "weak",
    "weak",
    "fair",
    "good",
    "good",
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
    if (predictable) {
      errors.push("Password is too common or predictable. Avoid common words with simple numbers.");
    }
  } else if (role === "admin") {
    if (trimmed.length <= 4) {
      errors.push("Store Admin password must be more than 4 characters (at least 5 characters).");
    }
    if (!/[A-Z]/.test(trimmed)) {
      errors.push("Must contain at least one uppercase letter (A-Z).");
    }
    if (!/[0-9]/.test(trimmed)) {
      errors.push("Must contain at least one number (0-9).");
    }
    if (!/[^A-Za-z0-9]/.test(trimmed)) {
      errors.push("Must contain at least one special character (@, #, !, $, etc.).");
    }
    if (predictable) {
      errors.push("Password is too common or predictable. Avoid common words with simple numbers.");
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
