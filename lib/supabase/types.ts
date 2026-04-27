/**
 * Database types generados por Supabase CLI:
 *   pnpm dlx supabase gen types typescript --project-id <ID> > lib/supabase/types.ts
 *
 * Este placeholder permite que los clientes compilen antes del primer deploy.
 * En cuanto se cree el proyecto Supabase de Capital Academy, este archivo se
 * regenera automáticamente y los `as` provisionales en las route handlers
 * pueden quitarse.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

export interface PaymentInsert {
  firstname: string;
  lastname: string;
  rut: string;
  email: string;
  phone: string;
  amount_clp: number;
  status?: PaymentStatus;
  fintoc_session_id?: string | null;
  fintoc_payment_id?: string | null;
  failure_reason?: string | null;
  raw_webhook?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  paid_at?: string | null;
}

export interface PaymentRow extends Required<PaymentInsert> {
  id: string;
  currency: string;
  created_at: string;
  updated_at: string;
}
