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
          teacher_id: string | null
          title: string | null
          audience: string
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
          teacher_id?: string | null
          title?: string | null
          audience?: string
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
          teacher_id?: string | null
          title?: string | null
          audience?: string
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
      instructors: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          photo_url: string | null
          profile_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          profile_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          profile_id?: string | null
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
            foreignKeyName: "session_resources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
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
      lesson_comments: {
        Row: {
          id: string
          lesson_id: string
          author_id: string
          parent_id: string | null
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          author_id: string
          parent_id?: string | null
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          author_id?: string
          parent_id?: string | null
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      lesson_chapters: {
        Row: {
          id: string
          lesson_id: string
          position_seconds: number
          title: string
          sort_order: number
          is_generated: boolean
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          position_seconds: number
          title: string
          sort_order?: number
          is_generated?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          position_seconds?: number
          title?: string
          sort_order?: number
          is_generated?: boolean
          created_at?: string
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
      lesson_summaries: {
        Row: {
          id: string
          lesson_id: string
          key_points: unknown[]
          summary_text: string
          glossary: unknown[]
          model_used: string
          prompt_version: number
          generation_count: number
          is_manually_edited: boolean
          generated_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          key_points?: unknown[]
          summary_text?: string
          glossary?: unknown[]
          model_used?: string
          prompt_version?: number
          generation_count?: number
          is_manually_edited?: boolean
          generated_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          key_points?: unknown[]
          summary_text?: string
          glossary?: unknown[]
          model_used?: string
          prompt_version?: number
          generation_count?: number
          is_manually_edited?: boolean
          generated_at?: string
          created_at?: string
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
          id: string
          lesson_id: string
          content_text: string | null
          content_vtt: string | null
          corrected_text: string | null
          corrected_vtt: string | null
          correction_status: string
          segments_needing_review: number
          language: string
          status: string
          error_message: string | null
          generated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          content_text?: string | null
          content_vtt?: string | null
          corrected_text?: string | null
          corrected_vtt?: string | null
          correction_status?: string
          segments_needing_review?: number
          language?: string
          status?: string
          error_message?: string | null
          generated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          content_text?: string | null
          content_vtt?: string | null
          corrected_text?: string | null
          corrected_vtt?: string | null
          correction_status?: string
          segments_needing_review?: number
          language?: string
          status?: string
          error_message?: string | null
          generated_at?: string | null
          created_at?: string
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
      transcript_segments: {
        Row: {
          id: string
          transcript_id: string
          segment_index: number
          start_seconds: number
          end_seconds: number
          original_text: string
          corrected_text: string | null
          needs_review: boolean
          review_reason: string | null
          manually_edited: boolean
          edited_by: string | null
          edited_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          transcript_id: string
          segment_index: number
          start_seconds: number
          end_seconds: number
          original_text: string
          corrected_text?: string | null
          needs_review?: boolean
          review_reason?: string | null
          manually_edited?: boolean
          edited_by?: string | null
          edited_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          transcript_id?: string
          segment_index?: number
          start_seconds?: number
          end_seconds?: number
          original_text?: string
          corrected_text?: string | null
          needs_review?: boolean
          review_reason?: string | null
          manually_edited?: boolean
          edited_by?: string | null
          edited_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "lesson_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          id: string
          program_id: string
          evaluation_id: string | null
          lesson_id: string | null
          question_text: string
          options: Record<string, string>
          question_type: Database["public"]["Enums"]["question_type"]
          correct_option: string | null
          correct_answer: string | string[] | null
          explanation: string | null
          is_generated: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          evaluation_id?: string | null
          lesson_id?: string | null
          question_text: string
          options: Record<string, string>
          question_type?: Database["public"]["Enums"]["question_type"]
          correct_option?: string | null
          correct_answer?: string | string[] | null
          explanation?: string | null
          is_generated?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          evaluation_id?: string | null
          lesson_id?: string | null
          question_text?: string
          options?: Record<string, string>
          question_type?: Database["public"]["Enums"]["question_type"]
          correct_option?: string | null
          correct_answer?: string | string[] | null
          explanation?: string | null
          is_generated?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          id: string
          program_id: string
          scope: Database["public"]["Enums"]["evaluation_scope"]
          module_id: string | null
          lesson_id: string | null
          session_id: string | null
          title: string
          description: string | null
          passing_grade_pct: number
          questions_per_attempt: number | null
          max_attempts: number
          time_limit_minutes: number | null
          min_completion_pct: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          scope: Database["public"]["Enums"]["evaluation_scope"]
          module_id?: string | null
          lesson_id?: string | null
          session_id?: string | null
          title: string
          description?: string | null
          passing_grade_pct?: number
          questions_per_attempt?: number | null
          max_attempts?: number
          time_limit_minutes?: number | null
          min_completion_pct?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          scope?: Database["public"]["Enums"]["evaluation_scope"]
          module_id?: string | null
          lesson_id?: string | null
          session_id?: string | null
          title?: string
          description?: string | null
          passing_grade_pct?: number
          questions_per_attempt?: number | null
          max_attempts?: number
          time_limit_minutes?: number | null
          min_completion_pct?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
            foreignKeyName: "evaluations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
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
      quiz_attempts: {
        Row: {
          id: string
          enrollment_id: string
          program_id: string
          evaluation_id: string | null
          questions_presented: string[]
          answers: Record<string, string | string[]>
          score_pct: number | null
          passed: boolean | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          enrollment_id: string
          program_id: string
          evaluation_id?: string | null
          questions_presented: string[]
          answers?: Record<string, string | string[]>
          score_pct?: number | null
          passed?: boolean | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          enrollment_id?: string
          program_id?: string
          evaluation_id?: string | null
          questions_presented?: string[]
          answers?: Record<string, string | string[]>
          score_pct?: number | null
          passed?: boolean | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
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
        ]
      }
      certificate_templates: {
        Row: {
          id: string
          program_id: string
          template_png_path: string
          font_family: string
          font_path: string
          name_center_x: number
          name_baseline_y: number
          default_font_size: number
          min_font_size: number
          max_name_width: number
          name_color_hex: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          template_png_path: string
          font_family?: string
          font_path?: string
          name_center_x?: number
          name_baseline_y?: number
          default_font_size?: number
          min_font_size?: number
          max_name_width?: number
          name_color_hex?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          template_png_path?: string
          font_family?: string
          font_path?: string
          name_center_x?: number
          name_baseline_y?: number
          default_font_size?: number
          min_font_size?: number
          max_name_width?: number
          name_color_hex?: string
          is_active?: boolean
          created_at?: string
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
          id: string
          enrollment_id: string
          program_id: string
          quiz_attempt_id: string | null
          student_name: string
          verification_code: string
          pdf_storage_path: string
          pdf_url: string | null
          emailed_at: string | null
          issued_at: string
          created_at: string
        }
        Insert: {
          id?: string
          enrollment_id: string
          program_id: string
          quiz_attempt_id?: string | null
          student_name: string
          verification_code: string
          pdf_storage_path: string
          pdf_url?: string | null
          emailed_at?: string | null
          issued_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          enrollment_id?: string
          program_id?: string
          quiz_attempt_id?: string | null
          student_name?: string
          verification_code?: string
          pdf_storage_path?: string
          pdf_url?: string | null
          emailed_at?: string | null
          issued_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          mux_asset_id: string | null
          mux_playback_id: string | null
          mux_track_id: string | null
          slug: string | null
          mux_upload_id: string | null
          position: number
          thumbnail_url: string | null
          title: string
          unlock_at: string | null
          video_duration_seconds: number | null
        }
        Insert: {
          content?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind: Database["public"]["Enums"]["lesson_kind"]
          module_id: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_track_id?: string | null
          mux_upload_id?: string | null
          position: number
          slug?: string | null
          thumbnail_url?: string | null
          title: string
          unlock_at?: string | null
          video_duration_seconds?: number | null
        }
        Update: {
          content?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["lesson_kind"]
          module_id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_track_id?: string | null
          mux_upload_id?: string | null
          position?: number
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
          address: string | null
          avatar_url: string | null
          bio: string | null
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
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
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
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
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
          slug: string | null
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
          slug?: string | null
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
      get_cohort_role: {
        Args: { p_cohort_id: string }
        Returns: Database["public"]["Enums"]["cohort_role_kind"]
      }
      has_cohort_access: { Args: { p_cohort_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_cohort_staff: { Args: { p_cohort_id: string }; Returns: boolean }
      is_platform_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      cohort_role_kind: "student" | "teacher" | "assistant"
      cohort_status: "planned" | "active" | "closed" | "archived"
      evaluation_scope: "final" | "module" | "lesson" | "session"
      question_type:
        | "single_choice"
        | "multiple_choice"
        | "true_false"
        | "short_answer"
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
      reminder_status: "sent" | "skipped" | "failed"
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
      reminder_status: ["sent", "skipped", "failed"],
      resource_type: ["pdf", "link", "template", "document", "other"],
      session_status: ["scheduled", "in_progress", "finished", "cancelled"],
      system_role: ["user", "ops", "admin"],
      user_role: ["student", "teacher", "ops", "admin"],
      video_progress_source: ["player", "manual", "system"],
    },
  },
} as const
