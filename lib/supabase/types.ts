export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      class_sessions: {
        Row: {
          cohort_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          lesson_id: string | null
          meeting_url: string | null
          modality: Database["public"]["Enums"]["lesson_kind"]
          module_id: string | null
          recording_url: string | null
          rescheduled_from: string | null
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          cohort_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          lesson_id?: string | null
          meeting_url?: string | null
          modality: Database["public"]["Enums"]["lesson_kind"]
          module_id?: string | null
          recording_url?: string | null
          rescheduled_from?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          lesson_id?: string | null
          meeting_url?: string | null
          modality?: Database["public"]["Enums"]["lesson_kind"]
          module_id?: string | null
          recording_url?: string | null
          rescheduled_from?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "program_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          code: string
          created_at: string
          end_date: string
          id: string
          name: string
          program_id: string
          slack_channel_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["cohort_status"]
        }
        Insert: {
          code: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          program_id: string
          slack_channel_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["cohort_status"]
        }
        Update: {
          code?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          program_id?: string
          slack_channel_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["cohort_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string | null
          max_redemptions: number | null
          percent_off: number
          redemptions: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label?: string | null
          max_redemptions?: number | null
          percent_off: number
          redemptions?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string | null
          max_redemptions?: number | null
          percent_off?: number
          redemptions?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          cohort_id: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          enrolled_at: string
          id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Insert: {
          cohort_id: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Update: {
          cohort_id?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          description: string | null
          duration_minutes: number | null
          id: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          position: number
          title: string
          unlock_at: string | null
        }
        Insert: {
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          position: number
          title: string
          unlock_at?: string | null
        }
        Update: {
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["lesson_kind"]
          module_id?: string
          position?: number
          title?: string
          unlock_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "program_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_clp: number
          commerce_order: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          discount_clp: number | null
          email: string
          failure_reason: string | null
          fintoc_payment_id: string | null
          fintoc_session_id: string | null
          firstname: string
          flow_order: number | null
          flow_token: string | null
          id: string
          ip_address: unknown
          lastname: string
          paid_at: string | null
          phone: string
          plan: string | null
          provider: string
          raw_webhook: Json | null
          rut: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          amount_clp: number
          commerce_order?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_clp?: number | null
          email: string
          failure_reason?: string | null
          fintoc_payment_id?: string | null
          fintoc_session_id?: string | null
          firstname: string
          flow_order?: number | null
          flow_token?: string | null
          id?: string
          ip_address?: unknown
          lastname: string
          paid_at?: string | null
          phone: string
          plan?: string | null
          provider?: string
          raw_webhook?: Json | null
          rut: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          amount_clp?: number
          commerce_order?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_clp?: number | null
          email?: string
          failure_reason?: string | null
          fintoc_payment_id?: string | null
          fintoc_session_id?: string | null
          firstname?: string
          flow_order?: number | null
          flow_token?: string | null
          id?: string
          ip_address?: unknown
          lastname?: string
          paid_at?: string | null
          phone?: string
          plan?: string | null
          provider?: string
          raw_webhook?: Json | null
          rut?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      program_modules: {
        Row: {
          code: string
          description: string | null
          id: string
          position: number
          program_id: string
          teacher_id: string | null
          title: string
          weight: number | null
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          position: number
          program_id: string
          teacher_id?: string | null
          title: string
          weight?: number | null
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          position?: number
          program_id?: string
          teacher_id?: string | null
          title?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_modules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_modules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_attendance_pct: number
          name: string
          passing_grade: number | null
          total_modules: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_attendance_pct?: number
          name: string
          passing_grade?: number | null
          total_modules?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_attendance_pct?: number
          name?: string
          passing_grade?: number | null
          total_modules?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      cohort_status: "planned" | "active" | "closed" | "archived"
      enrollment_status:
        | "invited"
        | "active"
        | "suspended"
        | "completed"
        | "dropped"
      lesson_kind: "live_in_person" | "live_online" | "recorded"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "refunded"
      session_status: "scheduled" | "in_progress" | "finished" | "cancelled"
      user_role: "student" | "teacher" | "ops" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cohort_status: ["planned", "active", "closed", "archived"],
      enrollment_status: [
        "invited",
        "active",
        "suspended",
        "completed",
        "dropped",
      ],
      lesson_kind: ["live_in_person", "live_online", "recorded"],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "refunded",
      ],
      session_status: ["scheduled", "in_progress", "finished", "cancelled"],
      user_role: ["student", "teacher", "ops", "admin"],
    },
  },
} as const
