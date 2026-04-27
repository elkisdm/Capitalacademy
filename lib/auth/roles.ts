export const USER_ROLES = ["student", "teacher", "ops", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_HOME_PATH: Record<UserRole, string> = {
  student: "/dashboard",
  teacher: "/teacher/dashboard",
  ops: "/ops/dashboard",
  admin: "/admin/dashboard",
};
