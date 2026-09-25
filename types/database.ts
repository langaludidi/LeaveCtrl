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
      approval_actions: {
        Row: {
          action: Database["public"]["Enums"]["approval_action_type"]
          actor_user_id: string | null
          created_at: string
          id: string
          note: string | null
          organisation_id: string
          request_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["approval_action_type"]
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organisation_id: string
          request_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["approval_action_type"]
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organisation_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          organisation_id: string
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          organisation_id: string
          payload?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          organisation_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          manager_employee_id: string | null
          name: string
          organisation_id: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          manager_employee_id?: string | null
          name: string
          organisation_id: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          manager_employee_id?: string | null
          name?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_manager_employee_fk"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedule_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          organisation_id: string
          work_schedule_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          organisation_id: string
          work_schedule_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          organisation_id?: string
          work_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedule_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedule_assignments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedule_assignments_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          employee_number: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          end_date: string | null
          first_name: string
          id: string
          last_name: string
          manager_employee_id: string | null
          organisation_id: string
          start_date: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          employee_number?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name: string
          id?: string
          last_name: string
          manager_employee_id?: string | null
          organisation_id: string
          start_date: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          employee_number?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name?: string
          id?: string
          last_name?: string
          manager_employee_id?: string | null
          organisation_id?: string
          start_date?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_entitlements: {
        Row: {
          created_at: string
          cycle_end: string
          cycle_start: string
          employee_id: string
          id: string
          leave_type_id: string
          opening_entitlement: number
          organisation_id: string
          policy_version_id: string | null
        }
        Insert: {
          created_at?: string
          cycle_end: string
          cycle_start: string
          employee_id: string
          id?: string
          leave_type_id: string
          opening_entitlement?: number
          organisation_id: string
          policy_version_id?: string | null
        }
        Update: {
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          opening_entitlement?: number
          organisation_id?: string
          policy_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_entitlements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_entitlements_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_entitlements_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_entitlements_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "leave_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_ledger_entries: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          entitlement_id: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          leave_type_id: string
          organisation_id: string
          quantity: number
          reason: string | null
          request_id: string | null
          source_metadata: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date: string
          employee_id: string
          entitlement_id?: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          leave_type_id: string
          organisation_id: string
          quantity: number
          reason?: string | null
          request_id?: string | null
          source_metadata?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          entitlement_id?: string | null
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          leave_type_id?: string
          organisation_id?: string
          quantity?: number
          reason?: string | null
          request_id?: string | null
          source_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "leave_ledger_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "leave_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy_versions: {
        Row: {
          approval_rule: Json
          carry_over_cap: number | null
          carry_over_expiry_date_rule: string | null
          created_at: string
          cycle_months: number | null
          effective_from: string
          effective_to: string | null
          entitlement_amount: number | null
          entitlement_method: string
          evidence_rule: Json
          id: string
          leave_type_id: string
          negative_balance_allowed: boolean
          organisation_id: string
          statutory_source: Json
          version: number
        }
        Insert: {
          approval_rule?: Json
          carry_over_cap?: number | null
          carry_over_expiry_date_rule?: string | null
          created_at?: string
          cycle_months?: number | null
          effective_from: string
          effective_to?: string | null
          entitlement_amount?: number | null
          entitlement_method: string
          evidence_rule?: Json
          id?: string
          leave_type_id: string
          negative_balance_allowed?: boolean
          organisation_id: string
          statutory_source?: Json
          version: number
        }
        Update: {
          approval_rule?: Json
          carry_over_cap?: number | null
          carry_over_expiry_date_rule?: string | null
          created_at?: string
          cycle_months?: number | null
          effective_from?: string
          effective_to?: string | null
          entitlement_amount?: number | null
          entitlement_method?: string
          evidence_rule?: Json
          id?: string
          leave_type_id?: string
          negative_balance_allowed?: boolean
          organisation_id?: string
          statutory_source?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_versions_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_policy_versions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_request_days: {
        Row: {
          chargeable_quantity: number
          exclusion_reason: string | null
          id: string
          leave_date: string
          organisation_id: string
          request_id: string
          scheduled_hours: number
        }
        Insert: {
          chargeable_quantity?: number
          exclusion_reason?: string | null
          id?: string
          leave_date: string
          organisation_id: string
          request_id: string
          scheduled_hours?: number
        }
        Update: {
          chargeable_quantity?: number
          exclusion_reason?: string | null
          id?: string
          leave_date?: string
          organisation_id?: string
          request_id?: string
          scheduled_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_request_days_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_request_days_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          note: string | null
          organisation_id: string
          policy_version_id: string | null
          quantity: number
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          note?: string | null
          organisation_id: string
          policy_version_id?: string | null
          quantity: number
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          note?: string | null
          organisation_id?: string
          policy_version_id?: string | null
          quantity?: number
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "leave_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          active: boolean
          code: string
          colour_token: string
          created_at: string
          id: string
          is_statutory: boolean
          name: string
          organisation_id: string
          requires_approval: boolean
          requires_evidence: boolean
          unit: string
        }
        Insert: {
          active?: boolean
          code: string
          colour_token?: string
          created_at?: string
          id?: string
          is_statutory?: boolean
          name: string
          organisation_id: string
          requires_approval?: boolean
          requires_evidence?: boolean
          unit?: string
        }
        Update: {
          active?: boolean
          code?: string
          colour_token?: string
          created_at?: string
          id?: string
          is_statutory?: boolean
          name?: string
          organisation_id?: string
          requires_approval?: boolean
          requires_evidence?: boolean
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_memberships: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organisation_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organisation_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organisation_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          country_code: string
          created_at: string
          currency_code: string
          id: string
          leave_year_start_month: number
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          currency_code?: string
          id?: string
          leave_year_start_month?: number
          name: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currency_code?: string
          id?: string
          leave_year_start_month?: number
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
          organisation_id: string
          source_reference: string | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          organisation_id: string
          source_reference?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          organisation_id?: string
          source_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_holidays_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          created_at: string
          friday_hours: number
          id: string
          monday_hours: number
          name: string
          organisation_id: string
          saturday_hours: number
          sunday_hours: number
          thursday_hours: number
          tuesday_hours: number
          wednesday_hours: number
        }
        Insert: {
          created_at?: string
          friday_hours?: number
          id?: string
          monday_hours?: number
          name: string
          organisation_id: string
          saturday_hours?: number
          sunday_hours?: number
          thursday_hours?: number
          tuesday_hours?: number
          wednesday_hours?: number
        }
        Update: {
          created_at?: string
          friday_hours?: number
          id?: string
          monday_hours?: number
          name?: string
          organisation_id?: string
          saturday_hours?: number
          sunday_hours?: number
          thursday_hours?: number
          tuesday_hours?: number
          wednesday_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leave_balances: {
        Row: {
          available_balance: number | null
          employee_id: string | null
          leave_type_id: string | null
          organisation_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_ledger_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bootstrap_organisation: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_name: string
          p_start_date?: string
        }
        Returns: string
      }
      configure_initial_leave_policy: {
        Args: {
          p_annual_days: number
          p_cycle_end: string
          p_cycle_start: string
        }
        Returns: string
      }
      decide_leave_request: {
        Args: { p_decision: string; p_note?: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["leave_request_status"]
      }
      submit_leave_request: {
        Args: {
          p_end_date: string
          p_leave_type_id: string
          p_note?: string
          p_start_date: string
        }
        Returns: string
      }
    }
    Enums: {
      approval_action_type:
        | "submitted"
        | "approved"
        | "declined"
        | "withdrawn"
        | "cancel_requested"
        | "cancel_approved"
      employment_status: "active" | "exited" | "suspended"
      leave_request_status:
        | "draft"
        | "submitted"
        | "pending_approval"
        | "approved"
        | "declined"
        | "withdrawn"
        | "cancellation_requested"
        | "cancelled"
      ledger_entry_type:
        | "entitlement_granted"
        | "accrual"
        | "carry_over"
        | "carry_over_expired"
        | "leave_reserved"
        | "leave_approved"
        | "leave_reversed"
        | "manual_adjustment"
        | "toil_earned"
        | "toil_used"
        | "migration_opening_balance"
      member_role:
        | "employee"
        | "manager"
        | "hr_admin"
        | "org_admin"
        | "reporter"
        | "auditor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      approval_action_type: [
        "submitted",
        "approved",
        "declined",
        "withdrawn",
        "cancel_requested",
        "cancel_approved",
      ],
      employment_status: ["active", "exited", "suspended"],
      leave_request_status: [
        "draft",
        "submitted",
        "pending_approval",
        "approved",
        "declined",
        "withdrawn",
        "cancellation_requested",
        "cancelled",
      ],
      ledger_entry_type: [
        "entitlement_granted",
        "accrual",
        "carry_over",
        "carry_over_expired",
        "leave_reserved",
        "leave_approved",
        "leave_reversed",
        "manual_adjustment",
        "toil_earned",
        "toil_used",
        "migration_opening_balance",
      ],
      member_role: [
        "employee",
        "manager",
        "hr_admin",
        "org_admin",
        "reporter",
        "auditor",
      ],
    },
  },
} as const
