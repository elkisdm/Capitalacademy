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
      _backup_program_modules_teacher_20260722: {
        Row: {
          code: string | null
          id: string | null
          program_id: string | null
          teacher_id: string | null
          title: string | null
        }
        Insert: {
          code?: string | null
          id?: string | null
          program_id?: string | null
          teacher_id?: string | null
          title?: string | null
        }
        Update: {
          code?: string | null
          id?: string | null
          program_id?: string | null
          teacher_id?: string | null
          title?: string | null
        }
        Relationships: []
      }
      access_email_log: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          email: string
          error: string | null
          id: string
          kind: string
          provider: string
          provider_message_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          email: string
          error?: string | null
          id?: string
          kind?: string
          provider?: string
          provider_message_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          email?: string
          error?: string | null
          id?: string
          kind?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_email_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_alerts: {
        Row: {
          absences_count: number
          cohort_id: string
          error: string | null
          id: string
          kind: string
          sent_at: string
          status: string
          student_id: string
        }
        Insert: {
          absences_count?: number
          cohort_id: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          status?: string
          student_id: string
        }
        Update: {
          absences_count?: number
          cohort_id?: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_alerts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capacitacion_followup_log: {
        Row: {
          completed_at: string | null
          recipients_count: number
          sent_at: string
          session_id: string
        }
        Insert: {
          completed_at?: string | null
          recipients_count?: number
          sent_at?: string
          session_id: string
        }
        Update: {
          completed_at?: string | null
          recipients_count?: number
          sent_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacitacion_followup_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          created_at: string
          default_font_size: number
          font_family: string
          font_path: string
          id: string
          is_active: boolean
          max_name_width: number
          min_font_size: number
          name_baseline_y: number
          name_center_x: number
          name_color_hex: string
          program_id: string
          template_png_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_font_size?: number
          font_family?: string
          font_path?: string
          id?: string
          is_active?: boolean
          max_name_width?: number
          min_font_size?: number
          name_baseline_y?: number
          name_center_x?: number
          name_color_hex?: string
          program_id: string
          template_png_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_font_size?: number
          font_family?: string
          font_path?: string
          id?: string
          is_active?: boolean
          max_name_width?: number
          min_font_size?: number
          name_baseline_y?: number
          name_center_x?: number
          name_color_hex?: string
          program_id?: string
          template_png_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          created_at: string
          emailed_at: string | null
          enrollment_id: string
          id: string
          issued_at: string
          pdf_storage_path: string
          pdf_url: string | null
          program_id: string
          quiz_attempt_id: string | null
          student_name: string
          verification_code: string
        }
        Insert: {
          created_at?: string
          emailed_at?: string | null
          enrollment_id: string
          id?: string
          issued_at?: string
          pdf_storage_path: string
          pdf_url?: string | null
          program_id: string
          quiz_attempt_id?: string | null
          student_name: string
          verification_code: string
        }
        Update: {
          created_at?: string
          emailed_at?: string | null
          enrollment_id?: string
          id?: string
          issued_at?: string
          pdf_storage_path?: string
          pdf_url?: string | null
          program_id?: string
          quiz_attempt_id?: string | null
          student_name?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_quiz_attempt_id_fkey"
            columns: ["quiz_attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          audience: string
          code: string
          cohort_id: string
          cover_image_url: string | null
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
          teacher_id: string | null
          title: string | null
        }
        Insert: {
          audience?: string
          code?: string
          cohort_id: string
          cover_image_url?: string | null
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
          teacher_id?: string | null
          title?: string | null
        }
        Update: {
          audience?: string
          code?: string
          cohort_id?: string
          cover_image_url?: string | null
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
          teacher_id?: string | null
          title?: string | null
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
          {
            foreignKeyName: "class_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_roles: {
        Row: {
          cohort_id: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["cohort_role_kind"]
          user_id: string
        }
        Insert: {
          cohort_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["cohort_role_kind"]
          user_id: string
        }
        Update: {
          cohort_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["cohort_role_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_roles_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          slug: string | null
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
          slug?: string | null
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
          slug?: string | null
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
      conversation_bookmarks: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_bookmarks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_id: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "conversation_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          lesson_comment_id: string | null
          lesson_id: string | null
          read_at: string | null
          thread_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          lesson_comment_id?: string | null
          lesson_id?: string | null
          read_at?: string | null
          thread_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          lesson_comment_id?: string | null
          lesson_id?: string | null
          read_at?: string | null
          thread_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "conversation_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notifications_lesson_comment_id_fkey"
            columns: ["lesson_comment_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notifications_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notifications_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          emoji: string
          id: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "conversation_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reactions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          author_id: string
          body: string
          category: string
          comment_count: number
          created_at: string
          edited_at: string | null
          id: string
          is_locked: boolean
          is_pinned: boolean
          last_activity_at: string
          program_id: string
          slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          category?: string
          comment_count?: number
          created_at?: string
          edited_at?: string | null
          id?: string
          is_locked?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          program_id: string
          slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: string
          comment_count?: number
          created_at?: string
          edited_at?: string | null
          id?: string
          is_locked?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          program_id?: string
          slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_threads_program_id_fkey"
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
      deliverable_open_recipients: {
        Row: {
          channel: string
          created_at: string
          deliverable_id: string
          error: string | null
          id: string
          kind: string
          sent_at: string
          status: string
          student_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          deliverable_id: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          status?: string
          student_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          deliverable_id?: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_open_recipients_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverable_open_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_submissions: {
        Row: {
          content_type: string | null
          deliverable_id: string
          file_size_bytes: number | null
          filename: string
          id: string
          storage_path: string
          student_id: string
          uploaded_at: string
        }
        Insert: {
          content_type?: string | null
          deliverable_id: string
          file_size_bytes?: number | null
          filename: string
          id?: string
          storage_path: string
          student_id: string
          uploaded_at?: string
        }
        Update: {
          content_type?: string | null
          deliverable_id?: string
          file_size_bytes?: number | null
          filename?: string
          id?: string
          storage_path?: string
          student_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_submissions_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverable_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          allow_multiple: boolean
          allowed_file_types: string[]
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string
          id: string
          max_file_size_bytes: number
          open_notified_at: string | null
          open_notified_count: number
          open_notify_completed_at: string | null
          opens_at: string
          program_id: string
          title: string
          updated_at: string
        }
        Insert: {
          allow_multiple?: boolean
          allowed_file_types?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at: string
          id?: string
          max_file_size_bytes?: number
          open_notified_at?: string | null
          open_notified_count?: number
          open_notify_completed_at?: string | null
          opens_at: string
          program_id: string
          title: string
          updated_at?: string
        }
        Update: {
          allow_multiple?: boolean
          allowed_file_types?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string
          id?: string
          max_file_size_bytes?: number
          open_notified_at?: string | null
          open_notified_count?: number
          open_notify_completed_at?: string | null
          opens_at?: string
          program_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          email: string
          error: string | null
          id: string
          sent_at: string
          status: string
          student_id: string
        }
        Insert: {
          campaign_id: string
          channel?: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          student_id: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_segment: string | null
          audience_status: string[]
          audience_student_ids: string[] | null
          body_md: string
          cohort_id: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          error: string | null
          id: string
          preheader: string | null
          program_id: string
          recipients_count: number
          send_started_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience_segment?: string | null
          audience_status?: string[]
          audience_student_ids?: string[] | null
          body_md: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          error?: string | null
          id?: string
          preheader?: string | null
          program_id: string
          recipients_count?: number
          send_started_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience_segment?: string | null
          audience_status?: string[]
          audience_student_ids?: string[] | null
          body_md?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          error?: string | null
          id?: string
          preheader?: string | null
          program_id?: string
          recipients_count?: number
          send_started_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          cohort_id: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          enrolled_at: string
          id: string
          segment: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Insert: {
          cohort_id: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          enrolled_at?: string
          id?: string
          segment?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Update: {
          cohort_id?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          enrolled_at?: string
          id?: string
          segment?: string | null
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
      evaluation_criteria: {
        Row: {
          created_at: string
          evaluation_id: string
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          evaluation_id: string
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          evaluation_id?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criteria_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_grades: {
        Row: {
          created_at: string
          criteria_marks: Json
          enrollment_id: string
          evaluation_id: string
          feedback: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          published_at: string | null
          quiz_attempt_id: string | null
          score_pct: number | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_marks?: Json
          enrollment_id: string
          evaluation_id: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          published_at?: string | null
          quiz_attempt_id?: string | null
          score_pct?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_marks?: Json
          enrollment_id?: string
          evaluation_id?: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          published_at?: string | null
          quiz_attempt_id?: string | null
          score_pct?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_grades_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_grades_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_grades_quiz_attempt_id_fkey"
            columns: ["quiz_attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_history: {
        Row: {
          created_at: string
          evaluacion: Json
          ficha: Json
          id: string
          nombre: string
          user_id: string
          valor_uf: number
        }
        Insert: {
          created_at?: string
          evaluacion: Json
          ficha: Json
          id?: string
          nombre?: string
          user_id: string
          valor_uf: number
        }
        Update: {
          created_at?: string
          evaluacion?: Json
          ficha?: Json
          id?: string
          nombre?: string
          user_id?: string
          valor_uf?: number
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          closes_at: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          lesson_id: string | null
          max_attempts: number
          min_completion_pct: number | null
          module_id: string | null
          opens_at: string | null
          passing_grade_pct: number
          program_id: string
          questions_per_attempt: number | null
          scope: string
          session_id: string | null
          slug: string | null
          time_limit_minutes: number | null
          title: string
          updated_at: string
          weight_pct: number | null
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          lesson_id?: string | null
          max_attempts?: number
          min_completion_pct?: number | null
          module_id?: string | null
          opens_at?: string | null
          passing_grade_pct?: number
          program_id: string
          questions_per_attempt?: number | null
          scope: string
          session_id?: string | null
          slug?: string | null
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
          weight_pct?: number | null
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          lesson_id?: string | null
          max_attempts?: number
          min_completion_pct?: number | null
          module_id?: string | null
          opens_at?: string | null
          passing_grade_pct?: number
          program_id?: string
          questions_per_attempt?: number | null
          scope?: string
          session_id?: string | null
          slug?: string | null
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "program_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          full_name: string
          headline: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          linkedin_url: string | null
          photo_url: string | null
          profile_id: string | null
          slug: string | null
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          headline?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          linkedin_url?: string | null
          photo_url?: string | null
          profile_id?: string | null
          slug?: string | null
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          headline?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          linkedin_url?: string | null
          photo_url?: string | null
          profile_id?: string | null
          slug?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_log: {
        Row: {
          channel: string
          email: string
          id: string
          sent_at: string
          sent_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          email: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          email?: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          ip_hash: string | null
          message: string | null
          phone: string
          program_interest: string
          role: string | null
          source: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          ip_hash?: string | null
          message?: string | null
          phone: string
          program_interest: string
          role?: string | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          ip_hash?: string | null
          message?: string | null
          phone?: string
          program_interest?: string
          role?: string | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      lesson_chapters: {
        Row: {
          created_at: string
          id: string
          is_generated: boolean
          lesson_id: string
          position_seconds: number
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_generated?: boolean
          lesson_id: string
          position_seconds: number
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_generated?: boolean
          lesson_id?: string
          position_seconds?: number
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_chapters_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          lesson_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          lesson_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          lesson_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resources: {
        Row: {
          created_at: string
          created_by: string | null
          file_size_bytes: number | null
          id: string
          lesson_id: string
          position: number
          storage_path: string | null
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          lesson_id: string
          position?: number
          storage_path?: string | null
          title: string
          type?: Database["public"]["Enums"]["resource_type"]
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          lesson_id?: string
          position?: number
          storage_path?: string | null
          title?: string
          type?: Database["public"]["Enums"]["resource_type"]
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_summaries: {
        Row: {
          created_at: string
          generated_at: string
          generation_count: number
          glossary: Json
          id: string
          is_manually_edited: boolean
          key_points: Json
          lesson_id: string
          model_used: string
          prompt_version: number
          summary_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generation_count?: number
          glossary?: Json
          id?: string
          is_manually_edited?: boolean
          key_points?: Json
          lesson_id: string
          model_used?: string
          prompt_version?: number
          summary_text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generation_count?: number
          glossary?: Json
          id?: string
          is_manually_edited?: boolean
          key_points?: Json
          lesson_id?: string
          model_used?: string
          prompt_version?: number
          summary_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_summaries_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_transcripts: {
        Row: {
          content_text: string | null
          content_vtt: string | null
          corrected_text: string | null
          corrected_vtt: string | null
          correction_status: string
          created_at: string
          error_message: string | null
          generated_at: string | null
          id: string
          language: string
          lesson_id: string
          search_vector: unknown
          segments_needing_review: number
          status: string
          updated_at: string
        }
        Insert: {
          content_text?: string | null
          content_vtt?: string | null
          corrected_text?: string | null
          corrected_vtt?: string | null
          correction_status?: string
          created_at?: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          language?: string
          lesson_id: string
          search_vector?: unknown
          segments_needing_review?: number
          status?: string
          updated_at?: string
        }
        Update: {
          content_text?: string | null
          content_vtt?: string | null
          corrected_text?: string | null
          corrected_vtt?: string | null
          correction_status?: string
          created_at?: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          language?: string
          lesson_id?: string
          search_vector?: unknown
          segments_needing_review?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_transcripts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          activity_type: string
          content: string | null
          cover_image_url: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          mux_asset_id: string | null
          mux_error: string | null
          mux_playback_id: string | null
          mux_track_id: string | null
          mux_upload_id: string | null
          position: number
          recording_notified_at: string | null
          recording_notify_completed_at: string | null
          slug: string | null
          thumbnail_url: string | null
          title: string
          unlock_at: string | null
          video_duration_seconds: number | null
        }
        Insert: {
          activity_type?: string
          content?: string | null
          cover_image_url?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          mux_asset_id?: string | null
          mux_error?: string | null
          mux_playback_id?: string | null
          mux_track_id?: string | null
          mux_upload_id?: string | null
          position: number
          recording_notified_at?: string | null
          recording_notify_completed_at?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          title: string
          unlock_at?: string | null
          video_duration_seconds?: number | null
        }
        Update: {
          activity_type?: string
          content?: string | null
          cover_image_url?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["lesson_kind"]
          module_id?: string
          mux_asset_id?: string | null
          mux_error?: string | null
          mux_playback_id?: string | null
          mux_track_id?: string | null
          mux_upload_id?: string | null
          position?: number
          recording_notified_at?: string | null
          recording_notify_completed_at?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          title?: string
          unlock_at?: string | null
          video_duration_seconds?: number | null
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
          document_type: string
          email: string
          enrolled_at: string | null
          enrollment_attempts: number
          enrollment_error: string | null
          enrollment_status: string
          failure_reason: string | null
          fintoc_payment_id: string | null
          fintoc_session_id: string | null
          firstname: string
          flow_order: number | null
          flow_token: string | null
          id: string
          invoice_data: Json | null
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
          document_type?: string
          email: string
          enrolled_at?: string | null
          enrollment_attempts?: number
          enrollment_error?: string | null
          enrollment_status?: string
          failure_reason?: string | null
          fintoc_payment_id?: string | null
          fintoc_session_id?: string | null
          firstname: string
          flow_order?: number | null
          flow_token?: string | null
          id?: string
          invoice_data?: Json | null
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
          document_type?: string
          email?: string
          enrolled_at?: string | null
          enrollment_attempts?: number
          enrollment_error?: string | null
          enrollment_status?: string
          failure_reason?: string | null
          fintoc_payment_id?: string | null
          fintoc_session_id?: string | null
          firstname?: string
          flow_order?: number | null
          flow_token?: string | null
          id?: string
          invoice_data?: Json | null
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
          address: string | null
          avatar_url: string | null
          bio: string | null
          birthday: string | null
          company: string | null
          created_at: string
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string
          job_title: string | null
          linkedin_url: string | null
          onboarding_completed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          rut: string | null
          system_role: Database["public"]["Enums"]["system_role"]
          tour_completed_at: string | null
          tour_outcome: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthday?: string | null
          company?: string | null
          created_at?: string
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          linkedin_url?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          rut?: string | null
          system_role?: Database["public"]["Enums"]["system_role"]
          tour_completed_at?: string | null
          tour_outcome?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthday?: string | null
          company?: string | null
          created_at?: string
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          rut?: string | null
          system_role?: Database["public"]["Enums"]["system_role"]
          tour_completed_at?: string | null
          tour_outcome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      program_modules: {
        Row: {
          code: string
          cover_image_url: string | null
          description: string | null
          id: string
          position: number
          program_id: string
          slug: string | null
          teacher_id: string | null
          title: string
          weight: number | null
        }
        Insert: {
          code: string
          cover_image_url?: string | null
          description?: string | null
          id?: string
          position: number
          program_id: string
          slug?: string | null
          teacher_id?: string | null
          title: string
          weight?: number | null
        }
        Update: {
          code?: string
          cover_image_url?: string | null
          description?: string | null
          id?: string
          position?: number
          program_id?: string
          slug?: string | null
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
          attendance_alerts_enabled: boolean
          code: string
          created_at: string
          description: string | null
          grade_exigencia_pct: number
          id: string
          is_active: boolean
          min_attendance_pct: number
          name: string
          passing_grade: number | null
          total_modules: number | null
        }
        Insert: {
          attendance_alerts_enabled?: boolean
          code: string
          created_at?: string
          description?: string | null
          grade_exigencia_pct?: number
          id?: string
          is_active?: boolean
          min_attendance_pct?: number
          name: string
          passing_grade?: number | null
          total_modules?: number | null
        }
        Update: {
          attendance_alerts_enabled?: boolean
          code?: string
          created_at?: string
          description?: string | null
          grade_exigencia_pct?: number
          id?: string
          is_active?: boolean
          min_attendance_pct?: number
          name?: string
          passing_grade?: number | null
          total_modules?: number | null
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          enrollment_id: string
          evaluation_id: string | null
          id: string
          passed: boolean | null
          program_id: string
          questions_presented: Json
          score_pct: number | null
          started_at: string
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          evaluation_id?: string | null
          id?: string
          passed?: boolean | null
          program_id: string
          questions_presented: Json
          score_pct?: number | null
          started_at?: string
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          evaluation_id?: string | null
          id?: string
          passed?: boolean | null
          program_id?: string
          questions_presented?: Json
          score_pct?: number | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: Json | null
          correct_option: string | null
          created_at: string
          evaluation_id: string | null
          explanation: string | null
          id: string
          is_generated: boolean
          lesson_id: string | null
          options: Json
          program_id: string
          question_text: string
          question_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          correct_answer?: Json | null
          correct_option?: string | null
          created_at?: string
          evaluation_id?: string | null
          explanation?: string | null
          id?: string
          is_generated?: boolean
          lesson_id?: string | null
          options: Json
          program_id: string
          question_text: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          correct_answer?: Json | null
          correct_option?: string | null
          created_at?: string
          evaluation_id?: string | null
          explanation?: string | null
          id?: string
          is_generated?: boolean
          lesson_id?: string | null
          options?: Json
          program_id?: string
          question_text?: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_notify_recipients: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          sent_at: string
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          sent_at?: string
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_notify_recipients_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_notify_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_join_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          cohort_id: string
          id: string
          marked_at: string
          marked_by: string | null
          method: string
          session_id: string
          student_id: string
        }
        Insert: {
          cohort_id: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          method?: string
          session_id: string
          student_id: string
        }
        Update: {
          cohort_id?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          method?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recordings: {
        Row: {
          duration_seconds: number | null
          egress_id: string | null
          ended_at: string | null
          error: string | null
          file_size_bytes: number | null
          id: string
          ingested_at: string | null
          mux_asset_id: string | null
          session_id: string
          started_at: string
          started_by: string | null
          status: string
          storage_deleted_at: string | null
          storage_path: string | null
        }
        Insert: {
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          error?: string | null
          file_size_bytes?: number | null
          id?: string
          ingested_at?: string | null
          mux_asset_id?: string | null
          session_id: string
          started_at?: string
          started_by?: string | null
          status?: string
          storage_deleted_at?: string | null
          storage_path?: string | null
        }
        Update: {
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          error?: string | null
          file_size_bytes?: number | null
          id?: string
          ingested_at?: string | null
          mux_asset_id?: string | null
          session_id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          storage_deleted_at?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_reminder_recipients: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          sent_at: string
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          sent_at?: string
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_reminder_recipients_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_reminder_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_change_notices: {
        Row: {
          cohort_id: string
          created_at: string
          id: string
          kind: string
          motivo: string | null
          new_ends_at: string | null
          new_starts_at: string | null
          previous_ends_at: string
          previous_starts_at: string
          recipients_count: number
          sent_by: string | null
          session_id: string | null
          session_title: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          id?: string
          kind: string
          motivo?: string | null
          new_ends_at?: string | null
          new_starts_at?: string | null
          previous_ends_at: string
          previous_starts_at: string
          recipients_count?: number
          sent_by?: string | null
          session_id?: string | null
          session_title: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          id?: string
          kind?: string
          motivo?: string | null
          new_ends_at?: string | null
          new_starts_at?: string | null
          previous_ends_at?: string
          previous_starts_at?: string
          recipients_count?: number
          sent_by?: string | null
          session_id?: string | null
          session_title?: string
        }
        Relationships: []
      }
      session_reminders: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          recipients_count: number
          sent_at: string
          session_id: string
          status: Database["public"]["Enums"]["reminder_status"]
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          recipients_count?: number
          sent_at?: string
          session_id: string
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          recipients_count?: number
          sent_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Relationships: [
          {
            foreignKeyName: "session_reminders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_resources: {
        Row: {
          created_at: string
          created_by: string | null
          file_size_bytes: number | null
          id: string
          position: number
          session_id: string
          storage_path: string | null
          title: string
          type: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          position?: number
          session_id: string
          storage_path?: string | null
          title: string
          type: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          position?: number
          session_id?: string
          storage_path?: string | null
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_resources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_activity_daily: {
        Row: {
          active_seconds: number
          activity_date: string
          beats: number
          created_at: string
          enrollment_id: string
          first_beat_at: string
          id: string
          last_beat_at: string
          updated_at: string
        }
        Insert: {
          active_seconds?: number
          activity_date: string
          beats?: number
          created_at?: string
          enrollment_id: string
          first_beat_at?: string
          id?: string
          last_beat_at?: string
          updated_at?: string
        }
        Update: {
          active_seconds?: number
          activity_date?: string
          beats?: number
          created_at?: string
          enrollment_id?: string
          first_beat_at?: string
          id?: string
          last_beat_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_activity_daily_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_campaign_recipients: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          email: string
          error: string | null
          id: string
          sent_at: string
          status: string
          student_id: string
        }
        Insert: {
          campaign_id: string
          channel?: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          student_id: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_campaigns: {
        Row: {
          audience_segment: string | null
          audience_status: string[]
          cohort_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_survey_id: string | null
          external_survey_slug: string
          external_survey_url: string
          id: string
          mode: string
          program_id: string
          recipients_count: number
          send_started_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_segment?: string | null
          audience_status?: string[]
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_survey_id?: string | null
          external_survey_slug: string
          external_survey_url: string
          id?: string
          mode: string
          program_id: string
          recipients_count?: number
          send_started_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_segment?: string | null
          audience_status?: string[]
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_survey_id?: string | null
          external_survey_slug?: string
          external_survey_url?: string
          id?: string
          mode?: string
          program_id?: string
          recipients_count?: number
          send_started_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_campaigns_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_campaigns_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          corrected_text: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          end_seconds: number
          id: string
          manually_edited: boolean
          needs_review: boolean
          original_text: string
          review_reason: string | null
          segment_index: number
          start_seconds: number
          transcript_id: string
        }
        Insert: {
          corrected_text?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          end_seconds: number
          id?: string
          manually_edited?: boolean
          needs_review?: boolean
          original_text: string
          review_reason?: string | null
          segment_index: number
          start_seconds: number
          transcript_id: string
        }
        Update: {
          corrected_text?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          end_seconds?: number
          id?: string
          manually_edited?: boolean
          needs_review?: boolean
          original_text?: string
          review_reason?: string | null
          segment_index?: number
          start_seconds?: number
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "lesson_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          duration_seconds: number
          enrollment_id: string
          id: string
          last_watched_at: string
          lesson_id: string
          max_position_seconds: number
          playback_position_seconds: number
          source: Database["public"]["Enums"]["video_progress_source"]
          watch_percentage: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          duration_seconds: number
          enrollment_id: string
          id?: string
          last_watched_at?: string
          lesson_id: string
          max_position_seconds?: number
          playback_position_seconds?: number
          source?: Database["public"]["Enums"]["video_progress_source"]
          watch_percentage?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          enrollment_id?: string
          id?: string
          last_watched_at?: string
          lesson_id?: string
          max_position_seconds?: number
          playback_position_seconds?: number
          source?: Database["public"]["Enums"]["video_progress_source"]
          watch_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_meeting_code: { Args: never; Returns: string }
      get_cohort_role: {
        Args: { p_cohort_id: string }
        Returns: Database["public"]["Enums"]["cohort_role_kind"]
      }
      has_cohort_access: { Args: { p_cohort_id: string }; Returns: boolean }
      has_evaluation_access: {
        Args: { p_evaluation_id: string }
        Returns: boolean
      }
      has_lesson_access: { Args: { p_lesson_id: string }; Returns: boolean }
      has_program_access: { Args: { p_program_id: string }; Returns: boolean }
      increment_coupon_redemptions: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_cohort_staff: { Args: { p_cohort_id: string }; Returns: boolean }
      is_evaluation_staff: {
        Args: { p_evaluation_id: string }
        Returns: boolean
      }
      is_lesson_staff: { Args: { p_lesson_id: string }; Returns: boolean }
      is_platform_staff: { Args: never; Returns: boolean }
      is_program_staff: { Args: { p_program_id: string }; Returns: boolean }
      is_staff_of_enrollment: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      owns_enrollment: { Args: { p_enrollment_id: string }; Returns: boolean }
      record_student_activity: {
        Args: {
          p_activity_date: string
          p_enrollment_id: string
          p_max_gap_seconds: number
        }
        Returns: Json
      }
      reorder_lessons: {
        Args: { p_module_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { texto: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      unaccent_bytes: { Args: { texto: string }; Returns: string }
    }
    Enums: {
      cohort_role_kind: "student" | "teacher" | "assistant"
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
      reminder_status: "sent" | "skipped" | "failed" | "pending"
      resource_type: "pdf" | "link" | "template" | "document" | "other"
      session_status: "scheduled" | "in_progress" | "finished" | "cancelled"
      system_role: "user" | "ops" | "admin"
      user_role: "student" | "teacher" | "ops" | "admin"
      video_progress_source: "player" | "manual" | "system"
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
      cohort_role_kind: ["student", "teacher", "assistant"],
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
      reminder_status: ["sent", "skipped", "failed", "pending"],
      resource_type: ["pdf", "link", "template", "document", "other"],
      session_status: ["scheduled", "in_progress", "finished", "cancelled"],
      system_role: ["user", "ops", "admin"],
      user_role: ["student", "teacher", "ops", "admin"],
      video_progress_source: ["player", "manual", "system"],
    },
  },
} as const
