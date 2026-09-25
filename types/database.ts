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
      blocked_periods: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          hard_block: boolean
          id: string
          leave_type_id: string | null
          name: string
          organisation_id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          hard_block?: boolean
          id?: string
          leave_type_id?: string | null
          name: string
          organisation_id: string
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          hard_block?: boolean
          id?: string
          leave_type_id?: string | null
          name?: string
          organisation_id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_periods_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_periods_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          minimum_available: number
          name: string
          organisation_id: string
          severity: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          minimum_available: number
          name: string
          organisation_id: string
          severity?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          minimum_available?: number
          name?: string
          organisation_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_rules_organisation_id_fkey"
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
      employee_employment_conditions: {
        Row: {
          change_type: string
          created_at: string
          created_by: string | null
          department_id: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          location_id: string | null
          manager_employee_id: string | null
          organisation_id: string
          reason: string | null
          work_mode: string
          work_schedule_id: string
        }
        Insert: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          location_id?: string | null
          manager_employee_id?: string | null
          organisation_id: string
          reason?: string | null
          work_mode?: string
          work_schedule_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          location_id?: string | null
          manager_employee_id?: string | null
          organisation_id?: string
          reason?: string | null
          work_mode?: string
          work_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_conditions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          email: string
          employee_id: string | null
          employee_number: string | null
          expires_at: string
          first_name: string
          grant_manager_role: boolean
          id: string
          last_name: string
          manager_employee_id: string | null
          organisation_id: string
          start_date: string
          token_hash: string
          work_schedule_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email: string
          employee_id?: string | null
          employee_number?: string | null
          expires_at?: string
          first_name: string
          grant_manager_role?: boolean
          id?: string
          last_name: string
          manager_employee_id?: string | null
          organisation_id: string
          start_date: string
          token_hash: string
          work_schedule_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email?: string
          employee_id?: string | null
          employee_number?: string | null
          expires_at?: string
          first_name?: string
          grant_manager_role?: boolean
          id?: string
          last_name?: string
          manager_employee_id?: string | null
          organisation_id?: string
          start_date?: string
          token_hash?: string
          work_schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_remuneration_history: {
        Row: {
          calculation_method: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          gross_amount: number
          id: string
          liability_daily_rate: number
          organisation_id: string
          pay_frequency: string
          reason: string | null
        }
        Insert: {
          calculation_method: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          gross_amount: number
          id?: string
          liability_daily_rate: number
          organisation_id: string
          pay_frequency: string
          reason?: string | null
        }
        Update: {
          calculation_method?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          gross_amount?: number
          id?: string
          liability_daily_rate?: number
          organisation_id?: string
          pay_frequency?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_remuneration_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_remuneration_history_organisation_id_fkey"
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
      employee_variable_earnings: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency_code: string
          earning_date: string
          employee_id: string
          id: string
          include_in_leave_liability: boolean
          note: string | null
          organisation_id: string
          source_overtime_event_id: string | null
          source_type: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          earning_date: string
          employee_id: string
          id?: string
          include_in_leave_liability?: boolean
          note?: string | null
          organisation_id: string
          source_overtime_event_id?: string | null
          source_type?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          earning_date?: string
          employee_id?: string
          id?: string
          include_in_leave_liability?: boolean
          note?: string | null
          organisation_id?: string
          source_overtime_event_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_variable_earnings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_variable_earnings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_variable_earnings_source_overtime_event_id_fkey"
            columns: ["source_overtime_event_id"]
            isOneToOne: false
            referencedRelation: "overtime_events"
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
      leave_request_coverage_checks: {
        Row: {
          available_after_request: number
          created_at: string
          id: string
          leave_date: string
          minimum_required: number
          organisation_id: string
          outcome: string
          request_id: string
          rule_id: string
        }
        Insert: {
          available_after_request: number
          created_at?: string
          id?: string
          leave_date: string
          minimum_required: number
          organisation_id: string
          outcome: string
          request_id: string
          rule_id: string
        }
        Update: {
          available_after_request?: number
          created_at?: string
          id?: string
          leave_date?: string
          minimum_required?: number
          organisation_id?: string
          outcome?: string
          request_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_request_coverage_checks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_request_coverage_checks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_request_coverage_checks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "coverage_rules"
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
      locations: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          organisation_id: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          organisation_id: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organisation_id_fkey"
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
      overtime_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          include_in_leave_liability: boolean
          multiplier: number
          note: string | null
          organisation_id: string
          paid_amount: number | null
          status: string
          treatment: string
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours: number
          id?: string
          include_in_leave_liability?: boolean
          multiplier?: number
          note?: string | null
          organisation_id: string
          paid_amount?: number | null
          status?: string
          treatment: string
          work_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number
          id?: string
          include_in_leave_liability?: boolean
          multiplier?: number
          note?: string | null
          organisation_id?: string
          paid_amount?: number | null
          status?: string
          treatment?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_settings: {
        Row: {
          default_multiplier: number
          default_treatment: string
          enabled: boolean
          include_paid_overtime_in_liability: boolean
          liability_averaging_weeks: number
          organisation_id: string
          toil_expiry_days: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_multiplier?: number
          default_treatment?: string
          enabled?: boolean
          include_paid_overtime_in_liability?: boolean
          liability_averaging_weeks?: number
          organisation_id: string
          toil_expiry_days?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_multiplier?: number
          default_treatment?: string
          enabled?: boolean
          include_paid_overtime_in_liability?: boolean
          liability_averaging_weeks?: number
          organisation_id?: string
          toil_expiry_days?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overtime_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          is_observed: boolean
          is_one_off: boolean
          jurisdiction_code: string
          name: string
          organisation_id: string
          source_kind: string
          source_reference: string | null
          source_verified_at: string | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          is_observed?: boolean
          is_one_off?: boolean
          jurisdiction_code?: string
          name: string
          organisation_id: string
          source_kind?: string
          source_reference?: string | null
          source_verified_at?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          is_observed?: boolean
          is_one_off?: boolean
          jurisdiction_code?: string
          name?: string
          organisation_id?: string
          source_kind?: string
          source_reference?: string | null
          source_verified_at?: string | null
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
      statutory_leave_rules: {
        Row: {
          calculation_method: string
          effective_from: string
          effective_to: string | null
          id: string
          jurisdiction_code: string
          legal_reference: string
          name: string
          parameters: Json
          rule_code: string
          source_reference: string
          verified_at: string
        }
        Insert: {
          calculation_method: string
          effective_from: string
          effective_to?: string | null
          id?: string
          jurisdiction_code: string
          legal_reference: string
          name: string
          parameters?: Json
          rule_code: string
          source_reference: string
          verified_at?: string
        }
        Update: {
          calculation_method?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          jurisdiction_code?: string
          legal_reference?: string
          name?: string
          parameters?: Json
          rule_code?: string
          source_reference?: string
          verified_at?: string
        }
        Relationships: []
      }
      toil_ledger_entries: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          entry_type: string
          expires_on: string | null
          hours: number
          id: string
          organisation_id: string
          overtime_event_id: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date: string
          employee_id: string
          entry_type: string
          expires_on?: string | null
          hours: number
          id?: string
          organisation_id: string
          overtime_event_id?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          entry_type?: string
          expires_on?: string | null
          hours?: number
          id?: string
          organisation_id?: string
          overtime_event_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "toil_ledger_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toil_ledger_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toil_ledger_entries_overtime_event_id_fkey"
            columns: ["overtime_event_id"]
            isOneToOne: false
            referencedRelation: "overtime_events"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          created_at: string
          cycle_anchor_date: string | null
          cycle_days: Json | null
          friday_hours: number
          id: string
          monday_hours: number
          name: string
          organisation_id: string
          saturday_hours: number
          schedule_kind: string
          sunday_hours: number
          thursday_hours: number
          tuesday_hours: number
          wednesday_hours: number
        }
        Insert: {
          created_at?: string
          cycle_anchor_date?: string | null
          cycle_days?: Json | null
          friday_hours?: number
          id?: string
          monday_hours?: number
          name: string
          organisation_id: string
          saturday_hours?: number
          schedule_kind?: string
          sunday_hours?: number
          thursday_hours?: number
          tuesday_hours?: number
          wednesday_hours?: number
        }
        Update: {
          created_at?: string
          cycle_anchor_date?: string | null
          cycle_days?: Json | null
          friday_hours?: number
          id?: string
          monday_hours?: number
          name?: string
          organisation_id?: string
          saturday_hours?: number
          schedule_kind?: string
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
      employee_current_conditions: {
        Row: {
          change_type: string | null
          department_id: string | null
          effective_from: string | null
          employee_id: string | null
          location_id: string | null
          manager_employee_id: string | null
          organisation_id: string | null
          reason: string | null
          work_mode: string | null
          work_schedule_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_conditions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_conditions_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_liability_rates: {
        Row: {
          averaging_end: string | null
          averaging_start: string | null
          averaging_weeks: number | null
          base_calculation_method: string | null
          base_daily_rate: number | null
          currency_code: string | null
          effective_daily_rate: number | null
          employee_id: string | null
          liability_calculation_method: string | null
          organisation_id: string | null
          scheduled_days: number | null
          variable_daily_rate: number | null
          variable_earnings_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_remuneration_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_remuneration_history_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      toil_balances: {
        Row: {
          available_hours: number | null
          employee_id: string | null
          organisation_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "toil_ledger_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toil_ledger_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_employee_record: {
        Args: {
          p_department_id?: string
          p_email: string
          p_employee_number?: string
          p_first_name: string
          p_grant_manager_role?: boolean
          p_last_name: string
          p_manager_employee_id?: string
          p_prepare_invitation?: boolean
          p_start_date: string
          p_work_schedule_id?: string
        }
        Returns: Json
      }
      adjust_toil_balance: {
        Args: { p_employee_id: string; p_hours: number; p_reason: string }
        Returns: string
      }
      apply_employee_condition_change: {
        Args: {
          p_change_type?: string
          p_department_id: string
          p_effective_from: string
          p_employee_id: string
          p_location_id?: string
          p_manager_employee_id: string
          p_reason?: string
          p_work_mode?: string
          p_work_schedule_id: string
        }
        Returns: string
      }
      assign_employee_department: {
        Args: { p_department_id: string; p_employee_id: string }
        Returns: undefined
      }
      assign_employee_manager: {
        Args: { p_employee_id: string; p_manager_employee_id: string }
        Returns: undefined
      }
      assign_employee_schedule: {
        Args: {
          p_effective_from?: string
          p_employee_id: string
          p_work_schedule_id: string
        }
        Returns: undefined
      }
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
      claim_employee_invitation: { Args: { p_token: string }; Returns: string }
      configure_initial_leave_policy: {
        Args: {
          p_annual_days: number
          p_cycle_end: string
          p_cycle_start: string
        }
        Returns: string
      }
      create_blocked_period: {
        Args: {
          p_end_date: string
          p_hard_block?: boolean
          p_leave_type_id?: string
          p_name: string
          p_reason?: string
          p_start_date: string
        }
        Returns: string
      }
      create_coverage_rule: {
        Args: {
          p_department_id: string
          p_minimum_available: number
          p_name: string
          p_severity?: string
        }
        Returns: string
      }
      create_department: {
        Args: { p_code?: string; p_name: string }
        Returns: string
      }
      create_employee_invitation: {
        Args: {
          p_department_id?: string
          p_email: string
          p_employee_number?: string
          p_first_name: string
          p_grant_manager_role?: boolean
          p_last_name: string
          p_manager_employee_id?: string
          p_start_date: string
          p_work_schedule_id?: string
        }
        Returns: string
      }
      create_location: {
        Args: { p_code?: string; p_name: string }
        Returns: string
      }
      create_rotating_shift_schedule: {
        Args: { p_anchor_date: string; p_cycle_pattern: string; p_name: string }
        Returns: string
      }
      create_work_schedule: {
        Args: {
          p_friday_hours?: number
          p_monday_hours?: number
          p_name: string
          p_saturday_hours?: number
          p_sunday_hours?: number
          p_thursday_hours?: number
          p_tuesday_hours?: number
          p_wednesday_hours?: number
        }
        Returns: string
      }
      decide_leave_cancellation: {
        Args: { p_decision: string; p_note?: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["leave_request_status"]
      }
      decide_leave_request: {
        Args: { p_decision: string; p_note?: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["leave_request_status"]
      }
      prepare_employee_access_invitation: {
        Args: { p_employee_id: string; p_grant_manager_role?: boolean }
        Returns: string
      }
      record_overtime_event: {
        Args: {
          p_employee_id: string
          p_hours: number
          p_include_in_leave_liability?: boolean
          p_multiplier?: number
          p_note?: string
          p_paid_amount?: number
          p_treatment: string
          p_work_date: string
        }
        Returns: string
      }
      record_variable_earning: {
        Args: {
          p_amount: number
          p_category: string
          p_earning_date: string
          p_employee_id: string
          p_include_in_leave_liability?: boolean
          p_note?: string
        }
        Returns: string
      }
      request_leave_cancellation: {
        Args: { p_note?: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["leave_request_status"]
      }
      set_employee_opening_balance: {
        Args: {
          p_balance: number
          p_employee_id: string
          p_leave_type_code: string
          p_reason?: string
        }
        Returns: number
      }
      set_employee_remuneration: {
        Args: {
          p_daily_rate_override?: number
          p_effective_from: string
          p_employee_id: string
          p_gross_amount: number
          p_pay_frequency: string
          p_reason?: string
        }
        Returns: string
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
      submit_leave_request_v2: {
        Args: {
          p_day_fraction?: number
          p_end_date: string
          p_leave_type_id: string
          p_note?: string
          p_start_date: string
        }
        Returns: string
      }
      update_overtime_settings: {
        Args: {
          p_default_multiplier: number
          p_default_treatment: string
          p_include_paid_overtime_in_liability: boolean
          p_liability_averaging_weeks: number
          p_toil_expiry_days: number
        }
        Returns: undefined
      }
      withdraw_leave_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["leave_request_status"]
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
        | "cancel_declined"
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
        "cancel_declined",
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
