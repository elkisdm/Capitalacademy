export const USER_ROLES = ["student", "teacher", "ops", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
