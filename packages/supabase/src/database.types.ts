export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          period_month: number
          period_year: number
          start_date: string
          status: Database["public"]["Enums"]["accounting_period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          period_month: number
          period_year: number
          start_date: string
          status?: Database["public"]["Enums"]["accounting_period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          period_month?: number
          period_year?: number
          start_date?: string
          status?: Database["public"]["Enums"]["accounting_period_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          item_code: string | null
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          item_code?: string | null
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          item_code?: string | null
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          author_id: string | null
          body: string
          category: Database["public"]["Enums"]["announcement_category"]
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          pinned: boolean
          priority: Database["public"]["Enums"]["announcement_priority"]
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          category?: Database["public"]["Enums"]["announcement_category"]
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: Database["public"]["Enums"]["announcement_category"]
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      application_logs: {
        Row: {
          component: string | null
          context: Json | null
          created_at: string | null
          id: string
          level: string
          message: string
          user_id: string | null
        }
        Insert: {
          component?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          level: string
          message: string
          user_id?: string | null
        }
        Update: {
          component?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          level?: string
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      appraisal_items: {
        Row: {
          achievements: string | null
          appraisal_id: string
          areas_to_improve: string | null
          created_at: string
          employee_comments: string | null
          employee_id: string
          goals: string | null
          id: string
          rating: number | null
          reviewed_at: string | null
          reviewer_comments: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["appraisal_item_status"]
          updated_at: string
        }
        Insert: {
          achievements?: string | null
          appraisal_id: string
          areas_to_improve?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id: string
          goals?: string | null
          id?: string
          rating?: number | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["appraisal_item_status"]
          updated_at?: string
        }
        Update: {
          achievements?: string | null
          appraisal_id?: string
          areas_to_improve?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id?: string
          goals?: string | null
          id?: string
          rating?: number | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["appraisal_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appraisal_items_appraisal_id_fkey"
            columns: ["appraisal_id"]
            isOneToOne: false
            referencedRelation: "appraisals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appraisal_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appraisal_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appraisals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          cycle: Database["public"]["Enums"]["appraisal_cycle"]
          id: string
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["appraisal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          cycle?: Database["public"]["Enums"]["appraisal_cycle"]
          id?: string
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["appraisal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          cycle?: Database["public"]["Enums"]["appraisal_cycle"]
          id?: string
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["appraisal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appraisals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          approval_request_id: string | null
          approver_id: string
          created_at: string
          decided_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          instance_id: string | null
          note: string | null
          step_id: string
          step_order: number | null
        }
        Insert: {
          approval_request_id?: string | null
          approver_id: string
          created_at?: string
          decided_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          instance_id?: string | null
          note?: string | null
          step_id: string
          step_order?: number | null
        }
        Update: {
          approval_request_id?: string | null
          approver_id?: string
          created_at?: string
          decided_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          instance_id?: string | null
          note?: string | null
          step_id?: string
          step_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "approval_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_flows: {
        Row: {
          company_id: string
          conditions: Json | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          entity_type: Database["public"]["Enums"]["approval_flow_entity_type"]
          id: string
          is_active: boolean
          is_default: boolean
          match_priority: number
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          entity_type?: Database["public"]["Enums"]["approval_flow_entity_type"]
          id?: string
          is_active?: boolean
          is_default?: boolean
          match_priority?: number
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          entity_type?: Database["public"]["Enums"]["approval_flow_entity_type"]
          id?: string
          is_active?: boolean
          is_default?: boolean
          match_priority?: number
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flows_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_instances: {
        Row: {
          company_id: string
          created_at: string
          current_approver_role: string | null
          current_approver_user_id: string | null
          current_step_id: string | null
          current_step_name: string | null
          current_step_order: number | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_instance_entity_type"]
          flow_id: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["approval_instance_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_approver_role?: string | null
          current_approver_user_id?: string | null
          current_step_id?: string | null
          current_step_name?: string | null
          current_step_order?: number | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_instance_entity_type"]
          flow_id: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["approval_instance_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_approver_role?: string | null
          current_approver_user_id?: string | null
          current_step_id?: string | null
          current_step_name?: string | null
          current_step_order?: number | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["approval_instance_entity_type"]
          flow_id?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["approval_instance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_instances_current_approver_user_id_fkey"
            columns: ["current_approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          company_id: string
          created_at: string
          current_step_order: number
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_request_entity_type"]
          flow_id: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["approval_request_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_step_order?: number
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_request_entity_type"]
          flow_id: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["approval_request_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_step_order?: number
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["approval_request_entity_type"]
          flow_id?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["approval_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          allow_self_approval: boolean
          approver_role: string | null
          approver_type: Database["public"]["Enums"]["approval_step_approver_type"]
          approver_user_id: string | null
          condition_rule: string | null
          created_at: string
          escalation_rule: string | null
          fallback_approver_user_id: string | null
          flow_id: string
          id: string
          is_active: boolean
          name: string
          step_order: number
          updated_at: string
        }
        Insert: {
          allow_self_approval?: boolean
          approver_role?: string | null
          approver_type: Database["public"]["Enums"]["approval_step_approver_type"]
          approver_user_id?: string | null
          condition_rule?: string | null
          created_at?: string
          escalation_rule?: string | null
          fallback_approver_user_id?: string | null
          flow_id: string
          id?: string
          is_active?: boolean
          name: string
          step_order: number
          updated_at?: string
        }
        Update: {
          allow_self_approval?: boolean
          approver_role?: string | null
          approver_type?: Database["public"]["Enums"]["approval_step_approver_type"]
          approver_user_id?: string | null
          condition_rule?: string | null
          created_at?: string
          escalation_rule?: string | null
          fallback_approver_user_id?: string | null
          flow_id?: string
          id?: string
          is_active?: boolean
          name?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_fallback_approver_user_id_fkey"
            columns: ["fallback_approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          company_id: string
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_record_status"]
          updated_at: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_record_status"]
          updated_at?: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json
          column_name: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          changes: Json
          column_name?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json
          column_name?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          account_no: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      branch_mappings: {
        Row: {
          canonical_code: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          raw_value: string
          updated_at: string
        }
        Insert: {
          canonical_code: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          raw_value: string
          updated_at?: string
        }
        Update: {
          canonical_code?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          raw_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          company_id: string
          created_at: string | null
          id: string
          name: string
          or_series: string | null
          updated_at: string | null
          vdo_series: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          or_series?: string | null
          updated_at?: string | null
          vdo_series?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          or_series?: string | null
          updated_at?: string | null
          vdo_series?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      column_permissions: {
        Row: {
          column_name: string
          created_at: string | null
          id: string
          permission_level: Database["public"]["Enums"]["column_permission_permission_level"]
          table_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          column_name: string
          created_at?: string | null
          id?: string
          permission_level: Database["public"]["Enums"]["column_permission_permission_level"]
          table_name?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          column_name?: string
          created_at?: string | null
          id?: string
          permission_level?: Database["public"]["Enums"]["column_permission_permission_level"]
          table_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_records: {
        Row: {
          amount: number
          chassis_no: string
          company_id: string
          created_at: string
          id: string
          period: string
          rule_id: string | null
          salesman_name: string
          status: Database["public"]["Enums"]["commission_record_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          chassis_no: string
          company_id: string
          created_at?: string
          id?: string
          period: string
          rule_id?: string | null
          salesman_name: string
          status?: Database["public"]["Enums"]["commission_record_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          chassis_no?: string
          company_id?: string
          created_at?: string
          id?: string
          period?: string
          rule_id?: string | null
          salesman_name?: string
          status?: Database["public"]["Enums"]["commission_record_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          amount: number
          branch_code: string | null
          company_id: string
          created_at: string
          id: string
          rule_name: string
          salesman_name: string | null
          threshold_days: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_code?: string | null
          company_id: string
          created_at?: string
          id?: string
          rule_name: string
          salesman_name?: string | null
          threshold_days?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          rule_name?: string
          salesman_name?: string | null
          threshold_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_branding: {
        Row: {
          accent_color: string | null
          address: string | null
          app_name: string | null
          app_short_name: string | null
          company_id: string
          company_name: string | null
          company_reg_no: string | null
          copyright_text: string | null
          created_at: string
          default_locale: string | null
          default_timezone: string | null
          favicon_path: string | null
          id: string
          legal_name: string | null
          login_logo_path: string | null
          logo_path: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          app_name?: string | null
          app_short_name?: string | null
          company_id: string
          company_name?: string | null
          company_reg_no?: string | null
          copyright_text?: string | null
          created_at?: string
          default_locale?: string | null
          default_timezone?: string | null
          favicon_path?: string | null
          id?: string
          legal_name?: string | null
          login_logo_path?: string | null
          logo_path?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          app_name?: string | null
          app_short_name?: string | null
          company_id?: string
          company_name?: string | null
          company_reg_no?: string | null
          copyright_text?: string | null
          created_at?: string
          default_locale?: string | null
          default_timezone?: string | null
          favicon_path?: string | null
          id?: string
          legal_name?: string | null
          login_logo_path?: string | null
          logo_path?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_branding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_branding_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_communications: {
        Row: {
          body: string | null
          communication_date: string
          company_id: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          subject: string | null
          type: Database["public"]["Enums"]["customer_communication_type"]
          updated_at: string
        }
        Insert: {
          body?: string | null
          communication_date?: string
          company_id: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          subject?: string | null
          type: Database["public"]["Enums"]["customer_communication_type"]
          updated_at?: string
        }
        Update: {
          body?: string | null
          communication_date?: string
          company_id?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["customer_communication_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_communications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_communications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          dms_customer_business_id: string | null
          dms_customer_id: string | null
          dms_last_synced_at: string | null
          email: string | null
          ic_no: string | null
          id: string
          is_deleted: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_last_synced_at?: string | null
          email?: string | null
          ic_no?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_last_synced_at?: string | null
          email?: string | null
          ic_no?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_preferences: {
        Row: {
          created_at: string
          id: string
          personal_dashboard: Json
          selected_kpis: string[]
          show_advanced_kpis: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          personal_dashboard?: Json
          selected_kpis?: string[]
          show_advanced_kpis?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          personal_dashboard?: Json
          selected_kpis?: string[]
          show_advanced_kpis?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          deal_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          deal_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          deal_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_documents: {
        Row: {
          company_id: string
          created_at: string
          deal_id: string
          doc_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_id: string
          doc_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_id?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_insurance: {
        Row: {
          company_id: string
          cover_note_issued_at: string | null
          cover_note_no: string | null
          cover_note_url: string | null
          coverage_type: string | null
          created_at: string
          deal_id: string
          expiry_date: string | null
          id: string
          insurer_id: string | null
          insurer_name: string | null
          notes: string | null
          policy_issued_at: string | null
          policy_no: string | null
          policy_url: string | null
          premium: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["deal_insurance_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          cover_note_issued_at?: string | null
          cover_note_no?: string | null
          cover_note_url?: string | null
          coverage_type?: string | null
          created_at?: string
          deal_id: string
          expiry_date?: string | null
          id?: string
          insurer_id?: string | null
          insurer_name?: string | null
          notes?: string | null
          policy_issued_at?: string | null
          policy_no?: string | null
          policy_url?: string | null
          premium?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["deal_insurance_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          cover_note_issued_at?: string | null
          cover_note_no?: string | null
          cover_note_url?: string | null
          coverage_type?: string | null
          created_at?: string
          deal_id?: string
          expiry_date?: string | null
          id?: string
          insurer_id?: string | null
          insurer_name?: string | null
          notes?: string | null
          policy_issued_at?: string | null
          policy_no?: string | null
          policy_url?: string | null
          premium?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["deal_insurance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_insurance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_insurance_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_insurance_insurer_id_fkey"
            columns: ["insurer_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_loan: {
        Row: {
          approval_letter_url: string | null
          approved_at: string | null
          bank_id: string | null
          bank_name: string | null
          company_id: string
          created_at: string
          deal_id: string
          disbursed_at: string | null
          id: string
          interest_rate: number | null
          loan_amount: number | null
          loan_form_url: string | null
          loan_tenure_months: number | null
          loan_type: string | null
          lou_received_at: string | null
          lou_url: string | null
          lou_verified_at: string | null
          monthly_installment: number | null
          notes: string | null
          rejected_at: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["deal_loan_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approval_letter_url?: string | null
          approved_at?: string | null
          bank_id?: string | null
          bank_name?: string | null
          company_id: string
          created_at?: string
          deal_id: string
          disbursed_at?: string | null
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          loan_form_url?: string | null
          loan_tenure_months?: number | null
          loan_type?: string | null
          lou_received_at?: string | null
          lou_url?: string | null
          lou_verified_at?: string | null
          monthly_installment?: number | null
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deal_loan_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approval_letter_url?: string | null
          approved_at?: string | null
          bank_id?: string | null
          bank_name?: string | null
          company_id?: string
          created_at?: string
          deal_id?: string
          disbursed_at?: string | null
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          loan_form_url?: string | null
          loan_tenure_months?: number | null
          loan_type?: string | null
          lou_received_at?: string | null
          lou_url?: string | null
          lou_verified_at?: string | null
          monthly_installment?: number | null
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deal_loan_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_loan_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_loan_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_loan_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_registration: {
        Row: {
          company_id: string
          created_at: string
          deal_id: string
          id: string
          jpj_ref: string | null
          notes: string | null
          plate_no: string | null
          plate_received_at: string | null
          registered_at: string | null
          registration_date: string | null
          registration_doc_url: string | null
          road_tax_expiry: string | null
          road_tax_url: string | null
          status: Database["public"]["Enums"]["deal_registration_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_id: string
          id?: string
          jpj_ref?: string | null
          notes?: string | null
          plate_no?: string | null
          plate_received_at?: string | null
          registered_at?: string | null
          registration_date?: string | null
          registration_doc_url?: string | null
          road_tax_expiry?: string | null
          road_tax_url?: string | null
          status?: Database["public"]["Enums"]["deal_registration_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_id?: string
          id?: string
          jpj_ref?: string | null
          notes?: string | null
          plate_no?: string | null
          plate_received_at?: string | null
          registered_at?: string | null
          registration_date?: string | null
          registration_doc_url?: string | null
          road_tax_expiry?: string | null
          road_tax_url?: string | null
          status?: Database["public"]["Enums"]["deal_registration_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_registration_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registration_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
          stage_order: number
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          stage_order?: number
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          stage_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_invoices: {
        Row: {
          branch: string | null
          car_colour: string | null
          car_model: string | null
          chassis_no: string | null
          company_id: string
          created_at: string
          dealer_name: string | null
          id: string
          invoice_date: string | null
          invoice_no: string
          sales_price: number | null
          status: string
          updated_at: string
        }
        Insert: {
          branch?: string | null
          car_colour?: string | null
          car_model?: string | null
          chassis_no?: string | null
          company_id: string
          created_at?: string
          dealer_name?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no: string
          sales_price?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch?: string | null
          car_colour?: string | null
          car_model?: string | null
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          dealer_name?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string
          sales_price?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          acc_code: string | null
          attn: string | null
          company_address: string | null
          company_id: string
          company_reg_no: string | null
          contact_no: string | null
          created_at: string
          email: string | null
          id: string
          mailing_address: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          acc_code?: string | null
          attn?: string | null
          company_address?: string | null
          company_id: string
          company_reg_no?: string | null
          contact_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mailing_address?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          acc_code?: string | null
          attn?: string | null
          company_address?: string | null
          company_id?: string
          company_reg_no?: string | null
          contact_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mailing_address?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          accessories_amount: number | null
          branch_id: string | null
          chassis_no: string | null
          colour: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_ic: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deal_no: string
          deposit_amount: number | null
          deposit_date: string | null
          discount_amount: number | null
          id: string
          lead_source: string | null
          lead_source_detail: string | null
          model_id: string | null
          model_name: string | null
          notes: string | null
          sales_advisor_employee_id: string | null
          sales_advisor_id: string | null
          sales_advisor_name: string | null
          selling_price: number | null
          stage: Database["public"]["Enums"]["deal_stage"]
          stage_entered_at: string
          stage_updated_at: string
          stage_updated_by: string | null
          total_amount: number | null
          updated_at: string
          variant: string | null
          vehicle_id: string | null
          vso_no: string | null
        }
        Insert: {
          accessories_amount?: number | null
          branch_id?: string | null
          chassis_no?: string | null
          colour?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_ic?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deal_no: string
          deposit_amount?: number | null
          deposit_date?: string | null
          discount_amount?: number | null
          id?: string
          lead_source?: string | null
          lead_source_detail?: string | null
          model_id?: string | null
          model_name?: string | null
          notes?: string | null
          sales_advisor_employee_id?: string | null
          sales_advisor_id?: string | null
          sales_advisor_name?: string | null
          selling_price?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_entered_at?: string
          stage_updated_at?: string
          stage_updated_by?: string | null
          total_amount?: number | null
          updated_at?: string
          variant?: string | null
          vehicle_id?: string | null
          vso_no?: string | null
        }
        Update: {
          accessories_amount?: number | null
          branch_id?: string | null
          chassis_no?: string | null
          colour?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_ic?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deal_no?: string
          deposit_amount?: number | null
          deposit_date?: string | null
          discount_amount?: number | null
          id?: string
          lead_source?: string | null
          lead_source_detail?: string | null
          model_id?: string | null
          model_name?: string | null
          notes?: string | null
          sales_advisor_employee_id?: string | null
          sales_advisor_id?: string | null
          sales_advisor_name?: string | null
          selling_price?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_entered_at?: string
          stage_updated_at?: string
          stage_updated_by?: string | null
          total_amount?: number | null
          updated_at?: string
          variant?: string | null
          vehicle_id?: string | null
          vso_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_sales_advisor_employee_id_fkey"
            columns: ["sales_advisor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_sales_advisor_id_fkey"
            columns: ["sales_advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_updated_by_fkey"
            columns: ["stage_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string
          cost_centre: string | null
          created_at: string
          description: string | null
          head_employee_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_centre?: string | null
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_centre?: string | null
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_employee_id_fkey"
            columns: ["head_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_collections: {
        Row: {
          branch_code: string | null
          chassis_no: string | null
          collection_amount: number | null
          collection_date: string | null
          collection_status: string | null
          company_id: string
          created_at: string
          dms_collection_id: string | null
          dms_so_no: string | null
          dms_so_no_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          branch_code?: string | null
          chassis_no?: string | null
          collection_amount?: number | null
          collection_date?: string | null
          collection_status?: string | null
          company_id: string
          created_at?: string
          dms_collection_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          branch_code?: string | null
          chassis_no?: string | null
          collection_amount?: number | null
          collection_date?: string | null
          collection_status?: string | null
          company_id?: string
          created_at?: string
          dms_collection_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_collections_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_deliveries: {
        Row: {
          branch_code: string | null
          canonical_vehicle_id: string | null
          chassis_no: string | null
          company_id: string
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          dms_delivery_id: string | null
          dms_so_no: string | null
          dms_so_no_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          branch_code?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          company_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          dms_delivery_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          branch_code?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          dms_delivery_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_deliveries_canonical_vehicle_id_fkey"
            columns: ["canonical_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_deliveries_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_leads: {
        Row: {
          branch_code: string | null
          company_id: string
          created_at: string
          dms_customer_id: string | null
          dms_lead_id: string | null
          fetched_at: string
          id: string
          lead_created_at: string | null
          lead_status: string | null
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          salesperson_code: string | null
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          company_id: string
          created_at?: string
          dms_customer_id?: string | null
          dms_lead_id?: string | null
          fetched_at?: string
          id?: string
          lead_created_at?: string | null
          lead_status?: string | null
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          company_id?: string
          created_at?: string
          dms_customer_id?: string | null
          dms_lead_id?: string | null
          fetched_at?: string
          id?: string
          lead_created_at?: string | null
          lead_status?: string | null
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_leads_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_master_data: {
        Row: {
          company_id: string
          created_at: string
          dms_entity_id: string | null
          entity_code: string | null
          entity_label: string | null
          entity_type: string
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dms_entity_id?: string | null
          entity_code?: string | null
          entity_label?: string | null
          entity_type: string
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dms_entity_id?: string | null
          entity_code?: string | null
          entity_label?: string | null
          entity_type?: string
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_master_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_master_data_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_order_vehicle_matches: {
        Row: {
          allocated_at: string | null
          allocation_status: string | null
          branch_code: string | null
          canonical_sales_order_id: string | null
          canonical_vehicle_id: string | null
          chassis_no: string | null
          company_id: string
          created_at: string
          dms_match_id: string | null
          dms_so_no: string | null
          dms_so_no_id: string | null
          dms_vs_stock_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          registered_at: string | null
          registration_status: string | null
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          allocated_at?: string | null
          allocation_status?: string | null
          branch_code?: string | null
          canonical_sales_order_id?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          company_id: string
          created_at?: string
          dms_match_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          dms_vs_stock_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          registered_at?: string | null
          registration_status?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          allocated_at?: string | null
          allocation_status?: string | null
          branch_code?: string | null
          canonical_sales_order_id?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          dms_match_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          dms_vs_stock_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          registered_at?: string | null
          registration_status?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_order_vehicle_matches_canonical_sales_order_id_fkey"
            columns: ["canonical_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_order_vehicle_matches_canonical_vehicle_id_fkey"
            columns: ["canonical_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_order_vehicle_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_order_vehicle_matches_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_prospects: {
        Row: {
          branch_code: string | null
          company_id: string
          created_at: string
          dms_customer_id: string | null
          dms_prospect_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          prospect_created_at: string | null
          prospect_status: string | null
          raw_payload: Json
          salesperson_code: string | null
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          company_id: string
          created_at?: string
          dms_customer_id?: string | null
          dms_prospect_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          prospect_created_at?: string | null
          prospect_status?: string | null
          raw_payload: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          company_id?: string
          created_at?: string
          dms_customer_id?: string | null
          dms_prospect_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          prospect_created_at?: string | null
          prospect_status?: string | null
          raw_payload?: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_prospects_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_sales_orders: {
        Row: {
          branch_code: string | null
          canonical_customer_id: string | null
          canonical_sales_order_id: string | null
          company_id: string
          created_at: string
          dms_customer_business_id: string | null
          dms_customer_id: string | null
          dms_so_no: string | null
          dms_so_no_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          order_date: string | null
          order_status: string | null
          payload_hash: string
          raw_payload: Json
          salesperson_code: string | null
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          canonical_customer_id?: string | null
          canonical_sales_order_id?: string | null
          company_id: string
          created_at?: string
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          order_date?: string | null
          order_status?: string | null
          payload_hash: string
          raw_payload: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          canonical_customer_id?: string | null
          canonical_sales_order_id?: string | null
          company_id?: string
          created_at?: string
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          order_date?: string | null
          order_status?: string | null
          payload_hash?: string
          raw_payload?: Json
          salesperson_code?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_sales_orders_canonical_customer_id_fkey"
            columns: ["canonical_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_sales_orders_canonical_sales_order_id_fkey"
            columns: ["canonical_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_sales_orders_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_soa_snapshots: {
        Row: {
          amount: number | null
          branch_code: string | null
          company_id: string
          created_at: string
          dms_so_no: string | null
          dms_soa_id: string | null
          fetched_at: string
          id: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          snapshot_date: string | null
          snapshot_status: string | null
          source_endpoint: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          branch_code?: string | null
          company_id: string
          created_at?: string
          dms_so_no?: string | null
          dms_soa_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          snapshot_date?: string | null
          snapshot_status?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          branch_code?: string | null
          company_id?: string
          created_at?: string
          dms_so_no?: string | null
          dms_soa_id?: string | null
          fetched_at?: string
          id?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          snapshot_date?: string | null
          snapshot_status?: string | null
          source_endpoint?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_soa_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_soa_snapshots_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_raw_vehicle_stock: {
        Row: {
          branch_code: string | null
          canonical_vehicle_id: string | null
          chassis_no: string | null
          color_code: string | null
          company_id: string
          config_code: string | null
          created_at: string
          dms_vs_stock_id: string | null
          fetched_at: string
          id: string
          model_code: string | null
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint: string
          stock_status: string | null
          sync_run_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          branch_code?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          color_code?: string | null
          company_id: string
          config_code?: string | null
          created_at?: string
          dms_vs_stock_id?: string | null
          fetched_at?: string
          id?: string
          model_code?: string | null
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          source_endpoint?: string
          stock_status?: string | null
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          branch_code?: string | null
          canonical_vehicle_id?: string | null
          chassis_no?: string | null
          color_code?: string | null
          company_id?: string
          config_code?: string | null
          created_at?: string
          dms_vs_stock_id?: string | null
          fetched_at?: string
          id?: string
          model_code?: string | null
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          source_endpoint?: string
          stock_status?: string | null
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_raw_vehicle_stock_canonical_vehicle_id_fkey"
            columns: ["canonical_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_vehicle_stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_raw_vehicle_stock_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_hrms_role_assignments: {
        Row: {
          assigned_by: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          hrms_role_id: string
          id: string
          is_primary: boolean
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          hrms_role_id: string
          id?: string
          is_primary?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          hrms_role_id?: string
          id?: string
          is_primary?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_hrms_role_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hrms_role_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hrms_role_assignments_hrms_role_id_fkey"
            columns: ["hrms_role_id"]
            isOneToOne: false
            referencedRelation: "hrms_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hrms_role_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_module_assignments: {
        Row: {
          active: boolean
          assignment_role: string
          company_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          employee_id: string
          id: string
          is_primary: boolean
          module_key: string
          source: Database["public"]["Enums"]["employee_module_assignment_source"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          assignment_role: string
          company_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean
          module_key: string
          source?: Database["public"]["Enums"]["employee_module_assignment_source"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          assignment_role?: string
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean
          module_key?: string
          source?: Database["public"]["Enums"]["employee_module_assignment_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_module_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          company_id: string
          contact_no: string | null
          created_at: string
          department_id: string | null
          ic_no: string | null
          id: string
          job_title_id: string | null
          join_date: string | null
          legacy_profile_id: string | null
          manager_employee_id: string | null
          name: string
          personal_email: string | null
          primary_role: Database["public"]["Enums"]["employee_primary_role"]
          resign_date: string | null
          staff_code: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          work_email: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          company_id: string
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          ic_no?: string | null
          id?: string
          job_title_id?: string | null
          join_date?: string | null
          legacy_profile_id?: string | null
          manager_employee_id?: string | null
          name: string
          personal_email?: string | null
          primary_role?: Database["public"]["Enums"]["employee_primary_role"]
          resign_date?: string | null
          staff_code?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          work_email?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          ic_no?: string | null
          id?: string
          job_title_id?: string | null
          join_date?: string | null
          legacy_profile_id?: string | null
          manager_employee_id?: string | null
          name?: string
          personal_email?: string | null
          primary_role?: Database["public"]["Enums"]["employee_primary_role"]
          resign_date?: string | null
          staff_code?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          work_email?: string | null
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
            foreignKeyName: "employees_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          rollout_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_companies: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      goods_receipt_notes: {
        Row: {
          company_id: string
          created_at: string
          grn_no: string
          id: string
          notes: string | null
          purchase_order_id: string
          received_by: string | null
          received_date: string
          supplier_dn_no: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          grn_no: string
          id?: string
          notes?: string | null
          purchase_order_id: string
          received_by?: string | null
          received_date: string
          supplier_dn_no?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          grn_no?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string
          received_by?: string | null
          received_date?: string
          supplier_dn_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_notes_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_lines: {
        Row: {
          company_id: string
          created_at: string
          goods_receipt_note_id: string
          id: string
          line_notes: string | null
          purchase_order_line_id: string
          received_quantity: number
        }
        Insert: {
          company_id: string
          created_at?: string
          goods_receipt_note_id: string
          id?: string
          line_notes?: string | null
          purchase_order_line_id: string
          received_quantity: number
        }
        Update: {
          company_id?: string
          created_at?: string
          goods_receipt_note_id?: string
          id?: string
          line_notes?: string | null
          purchase_order_line_id?: string
          received_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_goods_receipt_note_id_fkey"
            columns: ["goods_receipt_note_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      handling_fees: {
        Row: {
          billing: string | null
          company_id: string
          created_at: string
          description: string
          id: string
          item_code: string | null
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          billing?: string | null
          company_id: string
          created_at?: string
          description: string
          id?: string
          item_code?: string | null
          price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          billing?: string | null
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          item_code?: string | null
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hrms_roles: {
        Row: {
          authority_level: number
          can_approve_requests: boolean
          can_manage_employee_records: boolean
          can_view_hrms_reports: boolean
          category: Database["public"]["Enums"]["hrms_role_category"]
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_default: boolean
          name: string
          scope: Database["public"]["Enums"]["hrms_role_scope"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          authority_level?: number
          can_approve_requests?: boolean
          can_manage_employee_records?: boolean
          can_view_hrms_reports?: boolean
          category?: Database["public"]["Enums"]["hrms_role_category"]
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name: string
          scope?: Database["public"]["Enums"]["hrms_role_scope"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          authority_level?: number
          can_approve_requests?: boolean
          can_manage_employee_records?: boolean
          can_view_hrms_reports?: boolean
          category?: Database["public"]["Enums"]["hrms_role_category"]
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name?: string
          scope?: Database["public"]["Enums"]["hrms_role_scope"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hrms_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hrms_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          duplicate_rows: number
          error_rows: number
          file_name: string
          id: string
          published_at: string | null
          published_rows: number
          review_completed_at: string | null
          review_rows: number
          status: string
          total_rows: number
          uploaded_at: string
          uploaded_by: string
          valid_rows: number
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          duplicate_rows?: number
          error_rows?: number
          file_name: string
          id?: string
          published_at?: string | null
          published_rows?: number
          review_completed_at?: string | null
          review_rows?: number
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by: string
          valid_rows?: number
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          duplicate_rows?: number
          error_rows?: number
          file_name?: string
          id?: string
          published_at?: string | null
          published_rows?: number
          review_completed_at?: string | null
          review_rows?: number
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by?: string
          valid_rows?: number
        }
        Relationships: []
      }
      import_review_rows: {
        Row: {
          assigned_to: string | null
          branch_code: string | null
          chassis_no: string | null
          company_id: string
          created_at: string
          id: string
          import_batch_id: string
          normalized_payload: Json | null
          raw_payload: Json
          resolved_at: string | null
          resolved_vehicle_id: string | null
          review_reason: Database["public"]["Enums"]["import_review_row_review_reason"]
          review_status: Database["public"]["Enums"]["import_review_row_review_status"]
          row_number: number
          source_row_id: string | null
          updated_at: string
          validation_errors: Json
        }
        Insert: {
          assigned_to?: string | null
          branch_code?: string | null
          chassis_no?: string | null
          company_id: string
          created_at?: string
          id?: string
          import_batch_id: string
          normalized_payload?: Json | null
          raw_payload?: Json
          resolved_at?: string | null
          resolved_vehicle_id?: string | null
          review_reason: Database["public"]["Enums"]["import_review_row_review_reason"]
          review_status?: Database["public"]["Enums"]["import_review_row_review_status"]
          row_number: number
          source_row_id?: string | null
          updated_at?: string
          validation_errors?: Json
        }
        Update: {
          assigned_to?: string | null
          branch_code?: string | null
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          id?: string
          import_batch_id?: string
          normalized_payload?: Json | null
          raw_payload?: Json
          resolved_at?: string | null
          resolved_vehicle_id?: string | null
          review_reason?: Database["public"]["Enums"]["import_review_row_review_reason"]
          review_status?: Database["public"]["Enums"]["import_review_row_review_status"]
          row_number?: number
          source_row_id?: string | null
          updated_at?: string
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_review_rows_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_review_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_review_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_review_rows_resolved_vehicle_id_fkey"
            columns: ["resolved_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_fees: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          item_code: string | null
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          item_code?: string | null
          price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          item_code?: string | null
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      insurance_companies: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      insurance_cover_notes: {
        Row: {
          company_id: string
          cover_note_no: string | null
          created_at: string
          expiry_date: string | null
          id: string
          insurer: string
          order_id: string
          policy_no: string | null
          premium: number | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cover_note_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          insurer: string
          order_id: string
          policy_no?: string | null
          premium?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cover_note_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          insurer?: string
          order_id?: string
          policy_no?: string | null
          premium?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_cover_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_cover_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          dms_collection_ref: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          invoice_type: Database["public"]["Enums"]["invoice_invoice_type"]
          notes: string | null
          paid_amount: number
          payment_status: Database["public"]["Enums"]["invoice_payment_status"]
          reconciliation_status: Database["public"]["Enums"]["invoice_reconciliation_status"]
          sales_order_id: string
          source_type: Database["public"]["Enums"]["invoice_source_type"]
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          dms_collection_ref?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_no: string
          invoice_type?: Database["public"]["Enums"]["invoice_invoice_type"]
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          reconciliation_status?: Database["public"]["Enums"]["invoice_reconciliation_status"]
          sales_order_id: string
          source_type?: Database["public"]["Enums"]["invoice_source_type"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          dms_collection_ref?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          invoice_type?: Database["public"]["Enums"]["invoice_invoice_type"]
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          reconciliation_status?: Database["public"]["Enums"]["invoice_reconciliation_status"]
          sales_order_id?: string
          source_type?: Database["public"]["Enums"]["invoice_source_type"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["job_title_level"] | null
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["job_title_level"] | null
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["job_title_level"] | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_titles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string
          created_at: string
          description: string
          entry_date: string
          id: string
          period_id: string
          posted_at: string
          posted_by: string | null
          reference_no: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["journal_entry_source_type"]
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          entry_date: string
          id?: string
          period_id: string
          posted_at?: string
          posted_by?: string | null
          reference_no?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["journal_entry_source_type"]
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          period_id?: string
          posted_at?: string
          posted_by?: string | null
          reference_no?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_entry_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          formula: Json
          id: string
          is_active: boolean
          label: string
          landing_route: string | null
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          formula: Json
          id?: string
          is_active?: boolean
          label: string
          landing_route?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          formula?: Json
          id?: string
          is_active?: boolean
          label?: string
          landing_route?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_role_defaults: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          kpi_codes: string[]
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          kpi_codes?: string[]
          role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          kpi_codes?: string[]
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_role_defaults_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_role_defaults_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_followups: {
        Row: {
          author_id: string | null
          company_id: string
          created_at: string
          id: string
          next_action_date: string | null
          notes: string
          outcome: Database["public"]["Enums"]["lead_followup_outcome"] | null
          source_kind: Database["public"]["Enums"]["lead_followup_source_kind"]
          source_raw_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          next_action_date?: string | null
          notes: string
          outcome?: Database["public"]["Enums"]["lead_followup_outcome"] | null
          source_kind: Database["public"]["Enums"]["lead_followup_source_kind"]
          source_raw_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          next_action_date?: string | null
          notes?: string
          outcome?: Database["public"]["Enums"]["lead_followup_outcome"] | null
          source_kind?: Database["public"]["Enums"]["lead_followup_source_kind"]
          source_raw_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_followups_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string
          employee_id: string
          entitled_days: number
          id: string
          leave_type_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          entitled_days?: number
          id?: string
          leave_type_id: string
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          entitled_days?: number
          id?: string
          leave_type_id?: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_quota_rules: {
        Row: {
          branch_id: string | null
          company_id: string
          count_pending: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          effective_from: string
          effective_to: string | null
          half_day_weight: number
          id: string
          is_active: boolean
          leave_type_id: string
          max_requests: number
          period_type: Database["public"]["Enums"]["leave_quota_rule_period_type"]
          remarks: string | null
          rule_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          count_pending?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from: string
          effective_to?: string | null
          half_day_weight?: number
          id?: string
          is_active?: boolean
          leave_type_id: string
          max_requests?: number
          period_type?: Database["public"]["Enums"]["leave_quota_rule_period_type"]
          remarks?: string | null
          rule_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          count_pending?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from?: string
          effective_to?: string | null
          half_day_weight?: number
          id?: string
          is_active?: boolean
          leave_type_id?: string
          max_requests?: number
          period_type?: Database["public"]["Enums"]["leave_quota_rule_period_type"]
          remarks?: string | null
          rule_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_quota_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_quota_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_quota_rules_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_quota_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          attachment_file_name: string | null
          attachment_file_path: string | null
          attachment_file_size: number | null
          attachment_mime_type: string | null
          company_id: string
          created_at: string
          day_part: Database["public"]["Enums"]["leave_request_day_part"]
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        Insert: {
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          attachment_file_size?: number | null
          attachment_mime_type?: string | null
          company_id: string
          created_at?: string
          day_part?: Database["public"]["Enums"]["leave_request_day_part"]
          days: number
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Update: {
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          attachment_file_size?: number | null
          attachment_mime_type?: string | null
          company_id?: string
          created_at?: string
          day_part?: Database["public"]["Enums"]["leave_request_day_part"]
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
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
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          active: boolean
          carry_forward: boolean
          code: string
          company_id: string
          created_at: string
          days_per_year: number
          default_days: number
          id: string
          is_paid: boolean
          min_advance_notice_days: number | null
          name: string
          requires_balance: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          carry_forward?: boolean
          code: string
          company_id: string
          created_at?: string
          days_per_year?: number
          default_days?: number
          id?: string
          is_paid?: boolean
          min_advance_notice_days?: number | null
          name: string
          requires_balance?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          carry_forward?: boolean
          code?: string
          company_id?: string
          created_at?: string
          days_per_year?: number
          default_days?: number
          id?: string
          is_paid?: boolean
          min_advance_notice_days?: number | null
          name?: string
          requires_balance?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      legacy_staging_customers: {
        Row: {
          branch_code: string | null
          canonical_customer_id: string | null
          company_id: string
          company_registration_no: string | null
          created_at: string
          customer_name: string | null
          email: string | null
          fetched_at: string
          id: string
          identity_no: string | null
          legacy_customer_id: string | null
          legacy_source: string
          normalized_payload: Json | null
          payload_hash: string
          phone: string | null
          raw_payload: Json
          sync_run_id: string | null
          tin_no: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          canonical_customer_id?: string | null
          company_id: string
          company_registration_no?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          fetched_at?: string
          id?: string
          identity_no?: string | null
          legacy_customer_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          payload_hash: string
          phone?: string | null
          raw_payload: Json
          sync_run_id?: string | null
          tin_no?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          canonical_customer_id?: string | null
          company_id?: string
          company_registration_no?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          fetched_at?: string
          id?: string
          identity_no?: string | null
          legacy_customer_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          payload_hash?: string
          phone?: string | null
          raw_payload?: Json
          sync_run_id?: string | null
          tin_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_staging_customers_canonical_customer_id_fkey"
            columns: ["canonical_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_staging_customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_staging_customers_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_staging_records: {
        Row: {
          branch_code: string | null
          company_id: string
          created_at: string
          document_no: string | null
          fetched_at: string
          id: string
          legacy_record_id: string | null
          legacy_source: string
          normalized_payload: Json | null
          payload_hash: string
          raw_payload: Json
          record_type: Database["public"]["Enums"]["legacy_staging_record_record_type"]
          reference_code: string | null
          reference_label: string | null
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          company_id: string
          created_at?: string
          document_no?: string | null
          fetched_at?: string
          id?: string
          legacy_record_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          payload_hash: string
          raw_payload: Json
          record_type: Database["public"]["Enums"]["legacy_staging_record_record_type"]
          reference_code?: string | null
          reference_label?: string | null
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          company_id?: string
          created_at?: string
          document_no?: string | null
          fetched_at?: string
          id?: string
          legacy_record_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          payload_hash?: string
          raw_payload?: Json
          record_type?: Database["public"]["Enums"]["legacy_staging_record_record_type"]
          reference_code?: string | null
          reference_label?: string | null
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_staging_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_staging_records_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_staging_sales_invoices: {
        Row: {
          branch_code: string | null
          canonical_invoice_id: string | null
          chassis_no: string | null
          company_id: string
          created_at: string
          customer_identity_no: string | null
          customer_name: string | null
          dms_so_no: string | null
          fetched_at: string
          id: string
          invoice_amount: number | null
          invoice_date: string | null
          invoice_no: string | null
          legacy_invoice_id: string | null
          legacy_source: string
          normalized_payload: Json | null
          outstanding_amount: number | null
          paid_amount: number | null
          payload_hash: string
          raw_payload: Json
          sync_run_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          branch_code?: string | null
          canonical_invoice_id?: string | null
          chassis_no?: string | null
          company_id: string
          created_at?: string
          customer_identity_no?: string | null
          customer_name?: string | null
          dms_so_no?: string | null
          fetched_at?: string
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_no?: string | null
          legacy_invoice_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          outstanding_amount?: number | null
          paid_amount?: number | null
          payload_hash: string
          raw_payload: Json
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          branch_code?: string | null
          canonical_invoice_id?: string | null
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          customer_identity_no?: string | null
          customer_name?: string | null
          dms_so_no?: string | null
          fetched_at?: string
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_no?: string | null
          legacy_invoice_id?: string | null
          legacy_source?: string
          normalized_payload?: Json | null
          outstanding_amount?: number | null
          paid_amount?: number | null
          payload_hash?: string
          raw_payload?: Json
          sync_run_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_staging_sales_invoices_canonical_invoice_id_fkey"
            columns: ["canonical_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_staging_sales_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_staging_sales_invoices_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          applied_amount: number | null
          applied_date: string | null
          approved_amount: number | null
          approved_date: string | null
          company_id: string
          created_at: string
          disbursed_date: string | null
          id: string
          lender: string
          notes: string | null
          order_id: string
          status: Database["public"]["Enums"]["loan_application_status"]
          updated_at: string
        }
        Insert: {
          applied_amount?: number | null
          applied_date?: string | null
          approved_amount?: number | null
          approved_date?: string | null
          company_id: string
          created_at?: string
          disbursed_date?: string | null
          id?: string
          lender: string
          notes?: string | null
          order_id: string
          status?: Database["public"]["Enums"]["loan_application_status"]
          updated_at?: string
        }
        Update: {
          applied_amount?: number | null
          applied_date?: string | null
          approved_amount?: number | null
          approved_date?: string | null
          company_id?: string
          created_at?: string
          disbursed_date?: string | null
          id?: string
          lender?: string
          notes?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["loan_application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      module_settings: {
        Row: {
          company_id: string
          id: string
          is_active: boolean
          module_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          id?: string
          is_active?: boolean
          module_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          is_active?: boolean
          module_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      normalizer_column_authority: {
        Row: {
          authority: Database["public"]["Enums"]["normalizer_column_authority_authority"]
          canonical_table: string
          column_name: string
          created_at: string
          id: string
          notes: string | null
          overwrite_rule: Database["public"]["Enums"]["normalizer_column_authority_overwrite_rule"]
        }
        Insert: {
          authority: Database["public"]["Enums"]["normalizer_column_authority_authority"]
          canonical_table: string
          column_name: string
          created_at?: string
          id?: string
          notes?: string | null
          overwrite_rule: Database["public"]["Enums"]["normalizer_column_authority_overwrite_rule"]
        }
        Update: {
          authority?: Database["public"]["Enums"]["normalizer_column_authority_authority"]
          canonical_table?: string
          column_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          overwrite_rule?: Database["public"]["Enums"]["normalizer_column_authority_overwrite_rule"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      official_receipts: {
        Row: {
          amount: number | null
          attachment_url: string | null
          branch: string | null
          company_id: string
          created_at: string
          id: string
          receipt_date: string | null
          receipt_no: string
          status: string
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          amount?: number | null
          attachment_url?: string | null
          branch?: string | null
          company_id: string
          created_at?: string
          id?: string
          receipt_date?: string | null
          receipt_no: string
          status?: string
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          amount?: number | null
          attachment_url?: string | null
          branch?: string | null
          company_id?: string
          created_at?: string
          id?: string
          receipt_date?: string | null
          receipt_no?: string
          status?: string
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          event_type: Database["public"]["Enums"]["payment_event_event_type"]
          id: string
          invoice_id: string
          notes: string | null
          official_receipt_id: string | null
          payment_date: string
          payment_method: string | null
          receipt_reference: string | null
          reversal_of_event_id: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          event_type: Database["public"]["Enums"]["payment_event_event_type"]
          id?: string
          invoice_id: string
          notes?: string | null
          official_receipt_id?: string | null
          payment_date: string
          payment_method?: string | null
          receipt_reference?: string | null
          reversal_of_event_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: Database["public"]["Enums"]["payment_event_event_type"]
          id?: string
          invoice_id?: string
          notes?: string | null
          official_receipt_id?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_reference?: string | null
          reversal_of_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_official_receipt_id_fkey"
            columns: ["official_receipt_id"]
            isOneToOne: false
            referencedRelation: "official_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_reversal_of_event_id_fkey"
            columns: ["reversal_of_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_mappings: {
        Row: {
          canonical_value: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          raw_value: string
          updated_at: string
        }
        Insert: {
          canonical_value: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          raw_value: string
          updated_at?: string
        }
        Update: {
          canonical_value?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          raw_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_types: {
        Row: {
          billing: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          billing?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          billing?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          allowances: number
          basic_salary: number
          created_at: string
          employee_id: string
          epf_employee: number
          epf_employer: number
          gross_pay: number | null
          id: string
          income_tax: number
          net_pay: number | null
          notes: string | null
          other_deductions: number
          overtime: number
          payroll_run_id: string
          socso_employee: number
          socso_employer: number
          total_deductions: number | null
          updated_at: string
        }
        Insert: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          employee_id: string
          epf_employee?: number
          epf_employer?: number
          gross_pay?: number | null
          id?: string
          income_tax?: number
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_run_id: string
          socso_employee?: number
          socso_employer?: number
          total_deductions?: number | null
          updated_at?: string
        }
        Update: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          employee_id?: string
          epf_employee?: number
          epf_employer?: number
          gross_pay?: number | null
          id?: string
          income_tax?: number
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_run_id?: string
          socso_employee?: number
          socso_employer?: number
          total_deductions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period_month: number
          period_year: number
          status: Database["public"]["Enums"]["payroll_run_status"]
          total_gross: number
          total_headcount: number
          total_net: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          status?: Database["public"]["Enums"]["payroll_run_status"]
          total_gross?: number
          total_headcount?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          status?: Database["public"]["Enums"]["payroll_run_status"]
          total_gross?: number
          total_headcount?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_announcements: {
        Row: {
          announcement_type: Database["public"]["Enums"]["portal_announcement_announcement_type"]
          archived_at: string | null
          audience_scope: Database["public"]["Enums"]["portal_announcement_audience_scope"]
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean
          priority: Database["public"]["Enums"]["portal_announcement_priority"]
          publish_at: string | null
          status: Database["public"]["Enums"]["portal_announcement_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          announcement_type?: Database["public"]["Enums"]["portal_announcement_announcement_type"]
          archived_at?: string | null
          audience_scope?: Database["public"]["Enums"]["portal_announcement_audience_scope"]
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          priority?: Database["public"]["Enums"]["portal_announcement_priority"]
          publish_at?: string | null
          status?: Database["public"]["Enums"]["portal_announcement_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          announcement_type?: Database["public"]["Enums"]["portal_announcement_announcement_type"]
          archived_at?: string | null
          audience_scope?: Database["public"]["Enums"]["portal_announcement_audience_scope"]
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          priority?: Database["public"]["Enums"]["portal_announcement_priority"]
          publish_at?: string | null
          status?: Database["public"]["Enums"]["portal_announcement_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_documents: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["portal_document_category"]
          company_id: string
          created_at: string
          description: string | null
          effective_date: string | null
          expires_at: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          is_pinned: boolean
          status: Database["public"]["Enums"]["portal_document_status"]
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
          version: string
          visibility_scope: Database["public"]["Enums"]["portal_document_visibility_scope"]
        }
        Insert: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["portal_document_category"]
          company_id: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_pinned?: boolean
          status?: Database["public"]["Enums"]["portal_document_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          version?: string
          visibility_scope?: Database["public"]["Enums"]["portal_document_visibility_scope"]
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["portal_document_category"]
          company_id?: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_pinned?: boolean
          status?: Database["public"]["Enums"]["portal_document_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          version?: string
          visibility_scope?: Database["public"]["Enums"]["portal_document_visibility_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "portal_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_scope: string
          avatar_url: string | null
          branch_id: string | null
          can_bulk_edit_vehicles: boolean | null
          can_edit_vehicles: boolean | null
          can_view_vehicle_details: boolean | null
          company_id: string | null
          contact_no: string | null
          created_at: string
          department_id: string | null
          email: string
          employee_id: string | null
          ic_no: string | null
          id: string
          job_title_id: string | null
          join_date: string | null
          manager_id: string | null
          name: string
          portal_access_only: boolean
          resign_date: string | null
          role: Database["public"]["Enums"]["profile_role"]
          staff_code: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          access_scope?: string
          avatar_url?: string | null
          branch_id?: string | null
          can_bulk_edit_vehicles?: boolean | null
          can_edit_vehicles?: boolean | null
          can_view_vehicle_details?: boolean | null
          company_id?: string | null
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          employee_id?: string | null
          ic_no?: string | null
          id: string
          job_title_id?: string | null
          join_date?: string | null
          manager_id?: string | null
          name?: string
          portal_access_only?: boolean
          resign_date?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          staff_code?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          access_scope?: string
          avatar_url?: string | null
          branch_id?: string | null
          can_bulk_edit_vehicles?: boolean | null
          can_edit_vehicles?: boolean | null
          can_view_vehicle_details?: boolean | null
          company_id?: string | null
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          employee_id?: string | null
          ic_no?: string | null
          id?: string
          job_title_id?: string | null
          join_date?: string | null
          manager_id?: string | null
          name?: string
          portal_access_only?: boolean
          resign_date?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          staff_code?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          company_id: string
          created_at: string
          date: string
          holiday_type: Database["public"]["Enums"]["public_holiday_holiday_type"]
          id: string
          is_recurring: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          holiday_type?: Database["public"]["Enums"]["public_holiday_holiday_type"]
          id?: string
          is_recurring?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          holiday_type?: Database["public"]["Enums"]["public_holiday_holiday_type"]
          id?: string
          is_recurring?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          chassis_no: string
          company_id: string
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          is_deleted: boolean
          lifecycle_status: Database["public"]["Enums"]["purchase_invoice_lifecycle_status"]
          model: string
          notes: string | null
          paid_amount: number
          payment_status: Database["public"]["Enums"]["purchase_invoice_payment_status"]
          po_line_id: string | null
          received_date: string | null
          remark: string | null
          status: Database["public"]["Enums"]["purchase_invoice_status"]
          supplier: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          chassis_no: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_no: string
          is_deleted?: boolean
          lifecycle_status?: Database["public"]["Enums"]["purchase_invoice_lifecycle_status"]
          model: string
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["purchase_invoice_payment_status"]
          po_line_id?: string | null
          received_date?: string | null
          remark?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"]
          supplier: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          chassis_no?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          is_deleted?: boolean
          lifecycle_status?: Database["public"]["Enums"]["purchase_invoice_lifecycle_status"]
          model?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["purchase_invoice_payment_status"]
          po_line_id?: string | null
          received_date?: string | null
          remark?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"]
          supplier?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          chassis_no: string | null
          company_id: string
          created_at: string
          id: string
          line_amount: number | null
          line_no: number
          model: string
          purchase_order_id: string
          quantity: number
          unit_price: number
          updated_at: string
          variant: string | null
        }
        Insert: {
          chassis_no?: string | null
          company_id: string
          created_at?: string
          id?: string
          line_amount?: number | null
          line_no: number
          model: string
          purchase_order_id: string
          quantity?: number
          unit_price?: number
          updated_at?: string
          variant?: string | null
        }
        Update: {
          chassis_no?: string | null
          company_id?: string
          created_at?: string
          id?: string
          line_amount?: number | null
          line_no?: number
          model?: string
          purchase_order_id?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["purchase_order_lifecycle_status"]
          notes: string | null
          order_date: string
          po_no: string
          supplier: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["purchase_order_lifecycle_status"]
          notes?: string | null
          order_date: string
          po_no: string
          supplier: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["purchase_order_lifecycle_status"]
          notes?: string | null
          order_date?: string
          po_no?: string
          supplier?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          company_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          id: string
          platform: Database["public"]["Enums"]["push_token_platform"]
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          platform: Database["public"]["Enums"]["push_token_platform"]
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          platform?: Database["public"]["Enums"]["push_token_platform"]
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quality_issues: {
        Row: {
          chassis_no: string
          company_id: string
          created_at: string
          field: string
          id: string
          import_batch_id: string | null
          issue_type: string
          message: string
          severity: string
        }
        Insert: {
          chassis_no: string
          company_id?: string
          created_at?: string
          field: string
          id?: string
          import_batch_id?: string | null
          issue_type: string
          message: string
          severity?: string
        }
        Update: {
          chassis_no?: string
          company_id?: string
          created_at?: string
          field?: string
          id?: string
          import_batch_id?: string | null
          issue_type?: string
          message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_issues_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          caller_id: string
          count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          action: string
          caller_id: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          action?: string
          caller_id?: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      registration_fees: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      registration_records: {
        Row: {
          company_id: string
          created_at: string
          id: string
          jpj_ref: string | null
          notes: string | null
          order_id: string
          plate_no: string | null
          registered_date: string | null
          status: string
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          jpj_ref?: string | null
          notes?: string | null
          order_id: string
          plate_no?: string | null
          registered_date?: string | null
          status?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          jpj_ref?: string | null
          notes?: string | null
          order_id?: string
          plate_no?: string | null
          registered_date?: string | null
          status?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachment_settings: {
        Row: {
          company_id: string
          id: string
          max_file_size_mb: number
          max_files_per_ticket: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          id?: string
          max_file_size_mb?: number
          max_files_per_ticket?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          max_file_size_mb?: number
          max_files_per_ticket?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_attachment_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachment_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_categories: {
        Row: {
          approval_flow_id: string | null
          category_key: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          resolution_sla_hours: number | null
          response_sla_hours: number | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_flow_id?: string | null
          category_key: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          resolution_sla_hours?: number | null
          response_sla_hours?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_flow_id?: string | null
          category_key?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          resolution_sla_hours?: number | null
          response_sla_hours?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_categories_approval_flow_id_fkey"
            columns: ["approval_flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_form_fields: {
        Row: {
          category_key: string
          company_id: string
          conditional_logic: Json
          created_at: string
          created_by: string | null
          data_source: Database["public"]["Enums"]["request_form_field_data_source"] | null
          default_value: string
          field_key: string
          field_type: Database["public"]["Enums"]["request_form_field_field_type"]
          help_text: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json
          placeholder: string
          sort_order: number
          subcategory_key: string | null
          updated_at: string
          validation_rules: Json
        }
        Insert: {
          category_key: string
          company_id: string
          conditional_logic?: Json
          created_at?: string
          created_by?: string | null
          data_source?: Database["public"]["Enums"]["request_form_field_data_source"] | null
          default_value?: string
          field_key: string
          field_type?: Database["public"]["Enums"]["request_form_field_field_type"]
          help_text?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json
          placeholder?: string
          sort_order?: number
          subcategory_key?: string | null
          updated_at?: string
          validation_rules?: Json
        }
        Update: {
          category_key?: string
          company_id?: string
          conditional_logic?: Json
          created_at?: string
          created_by?: string | null
          data_source?: Database["public"]["Enums"]["request_form_field_data_source"] | null
          default_value?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["request_form_field_field_type"]
          help_text?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json
          placeholder?: string
          sort_order?: number
          subcategory_key?: string | null
          updated_at?: string
          validation_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "request_form_fields_category_fkey"
            columns: ["company_id", "category_key"]
            isOneToOne: false
            referencedRelation: "request_categories"
            referencedColumns: ["company_id", "category_key"]
          },
          {
            foreignKeyName: "request_form_fields_subcategory_fkey"
            columns: ["company_id", "category_key", "subcategory_key"]
            isOneToOne: false
            referencedRelation: "request_subcategories"
            referencedColumns: ["company_id", "category_key", "subcategory_key"]
          },
        ]
      }
      request_module_settings: {
        Row: {
          allowed_file_types: Json
          chat_attachment_max_files: number
          closure_rules: Json
          company_id: string
          created_at: string
          default_fallback_queue: string
          id: string
          notification_templates: Json
          pause_sla_on_pending_requester: boolean
          priority_matrix: Json
          reopen_window_days: number
          request_title_placeholder: string
          role_permissions: Json
          sla_at_risk_threshold_hours: number
          sla_start_event: Database["public"]["Enums"]["request_module_setting_sla_start_event"]
          status_labels: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_file_types?: Json
          chat_attachment_max_files?: number
          closure_rules?: Json
          company_id: string
          created_at?: string
          default_fallback_queue?: string
          id?: string
          notification_templates?: Json
          pause_sla_on_pending_requester?: boolean
          priority_matrix?: Json
          reopen_window_days?: number
          request_title_placeholder?: string
          role_permissions?: Json
          sla_at_risk_threshold_hours?: number
          sla_start_event?: Database["public"]["Enums"]["request_module_setting_sla_start_event"]
          status_labels?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_file_types?: Json
          chat_attachment_max_files?: number
          closure_rules?: Json
          company_id?: string
          created_at?: string
          default_fallback_queue?: string
          id?: string
          notification_templates?: Json
          pause_sla_on_pending_requester?: boolean
          priority_matrix?: Json
          reopen_window_days?: number
          request_title_placeholder?: string
          role_permissions?: Json
          sla_at_risk_threshold_hours?: number
          sla_start_event?: Database["public"]["Enums"]["request_module_setting_sla_start_event"]
          status_labels?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_module_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_routing_rules: {
        Row: {
          assign_to_user_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match_category: string | null
          match_priority: string | null
          match_subcategory: string | null
          match_submitter_role: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          assign_to_user_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_category?: string | null
          match_priority?: string | null
          match_subcategory?: string | null
          match_submitter_role?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          assign_to_user_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_category?: string | null
          match_priority?: string | null
          match_subcategory?: string | null
          match_submitter_role?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      request_saved_filters: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          name: string
          scope: Database["public"]["Enums"]["request_saved_filter_scope"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          scope?: Database["public"]["Enums"]["request_saved_filter_scope"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          scope?: Database["public"]["Enums"]["request_saved_filter_scope"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_saved_filters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      request_subcategories: {
        Row: {
          approval_flow_id: string | null
          category_key: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          subcategory_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_flow_id?: string | null
          category_key: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          subcategory_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_flow_id?: string | null
          category_key?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          subcategory_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_subcategories_approval_flow_id_fkey"
            columns: ["approval_flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_subcategories_category_fkey"
            columns: ["company_id", "category_key"]
            isOneToOne: false
            referencedRelation: "request_categories"
            referencedColumns: ["company_id", "category_key"]
          },
          {
            foreignKeyName: "request_subcategories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_templates: {
        Row: {
          body: string
          category_key: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: string
          sort_order: number
          subcategory_key: string | null
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          category_key: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: string
          sort_order?: number
          subcategory_key?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          category_key?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: string
          sort_order?: number
          subcategory_key?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      road_tax_fees: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_sections: {
        Row: {
          allowed: boolean
          company_id: string
          created_at: string
          id: string
          role: string
          section: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          company_id: string
          created_at?: string
          id?: string
          role: string
          section: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["sales_activity_activity_type"]
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          due_date: string | null
          id: string
          notes: string | null
          order_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["sales_activity_activity_type"]
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["sales_activity_activity_type"]
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_activities_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_advisors: {
        Row: {
          branch_code: string | null
          code: string | null
          company_id: string
          contact_no: string | null
          created_at: string
          description: string | null
          email: string | null
          ic_no: string | null
          id: string
          join_date: string | null
          legacy_id: string | null
          name: string
          resign_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          code?: string | null
          company_id: string
          contact_no?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          ic_no?: string | null
          id?: string
          join_date?: string | null
          legacy_id?: string | null
          name: string
          resign_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          code?: string | null
          company_id?: string
          contact_no?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          ic_no?: string | null
          id?: string
          join_date?: string | null
          legacy_id?: string | null
          name?: string
          resign_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_advisors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_cancellation_reasons: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          narration: string | null
          order_id: string
          reason_code: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          narration?: string | null
          order_id: string
          reason_code?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          narration?: string | null
          order_id?: string
          reason_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_cancellation_reasons_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cancellation_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cancellation_reasons_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_documents: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string | null
          doc_type: string
          id: string
          order_id: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id?: string | null
          doc_type: string
          id?: string
          order_id?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string | null
          doc_type?: string
          id?: string
          order_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          balance_customer: number | null
          bank_loan_amount: number | null
          booking_amount: number | null
          booking_date: string
          branch_code: string
          chassis_no: string | null
          color: string | null
          company_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          deleted_at: string | null
          deposit_amount: number | null
          discount: number | null
          dms_customer_business_id: string | null
          dms_customer_id: string | null
          dms_last_synced_at: string | null
          dms_so_no: string | null
          dms_so_no_id: string | null
          expected_delivery_date: string | null
          finance_company: string | null
          ic_no: string | null
          id: string
          insurance_company: string | null
          is_deleted: boolean
          last_cancel: string | null
          legacy_id: string | null
          model: string | null
          notes: string | null
          order_no: string | null
          order_status: string | null
          outstanding_amount: number | null
          overall_total: number | null
          payment_method: string | null
          plate_no: string | null
          salesman_id: string | null
          salesman_name: string
          selling_price: number | null
          stage_id: string | null
          total_amount_bank: number | null
          total_refund_amount: number | null
          updated_at: string
          variant: string | null
          vehicle_id: string | null
          vso_no: string | null
        }
        Insert: {
          balance_customer?: number | null
          bank_loan_amount?: number | null
          booking_amount?: number | null
          booking_date: string
          branch_code: string
          chassis_no?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          discount?: number | null
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_last_synced_at?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          expected_delivery_date?: string | null
          finance_company?: string | null
          ic_no?: string | null
          id?: string
          insurance_company?: string | null
          is_deleted?: boolean
          last_cancel?: string | null
          legacy_id?: string | null
          model?: string | null
          notes?: string | null
          order_no?: string | null
          order_status?: string | null
          outstanding_amount?: number | null
          overall_total?: number | null
          payment_method?: string | null
          plate_no?: string | null
          salesman_id?: string | null
          salesman_name: string
          selling_price?: number | null
          stage_id?: string | null
          total_amount_bank?: number | null
          total_refund_amount?: number | null
          updated_at?: string
          variant?: string | null
          vehicle_id?: string | null
          vso_no?: string | null
        }
        Update: {
          balance_customer?: number | null
          bank_loan_amount?: number | null
          booking_amount?: number | null
          booking_date?: string
          branch_code?: string
          chassis_no?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          discount?: number | null
          dms_customer_business_id?: string | null
          dms_customer_id?: string | null
          dms_last_synced_at?: string | null
          dms_so_no?: string | null
          dms_so_no_id?: string | null
          expected_delivery_date?: string | null
          finance_company?: string | null
          ic_no?: string | null
          id?: string
          insurance_company?: string | null
          is_deleted?: boolean
          last_cancel?: string | null
          legacy_id?: string | null
          model?: string | null
          notes?: string | null
          order_no?: string | null
          order_status?: string | null
          outstanding_amount?: number | null
          overall_total?: number | null
          payment_method?: string | null
          plate_no?: string | null
          salesman_id?: string | null
          salesman_name?: string
          selling_price?: number | null
          stage_id?: string | null
          total_amount_bank?: number | null
          total_refund_amount?: number | null
          updated_at?: string
          variant?: string | null
          vehicle_id?: string | null
          vso_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "sales_advisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      salesman_targets: {
        Row: {
          branch_code: string
          company_id: string
          created_at: string
          id: string
          period_month: number
          period_year: number
          salesman_name: string
          target_revenue: number
          target_units: number
          updated_at: string
        }
        Insert: {
          branch_code: string
          company_id: string
          created_at?: string
          id?: string
          period_month: number
          period_year: number
          salesman_name: string
          target_revenue?: number
          target_units?: number
          updated_at?: string
        }
        Update: {
          branch_code?: string
          company_id?: string
          created_at?: string
          id?: string
          period_month?: number
          period_year?: number
          salesman_name?: string
          target_revenue?: number
          target_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesman_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          date_range: Database["public"]["Enums"]["scheduled_report_date_range"]
          day_of_month: number | null
          day_of_week: number | null
          frequency: Database["public"]["Enums"]["scheduled_report_frequency"]
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_status: string | null
          recipients: string[]
          report_id: string
          report_label: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          date_range?: Database["public"]["Enums"]["scheduled_report_date_range"]
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: Database["public"]["Enums"]["scheduled_report_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          recipients?: string[]
          report_id: string
          report_label: string
          time_of_day?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          date_range?: Database["public"]["Enums"]["scheduled_report_date_range"]
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: Database["public"]["Enums"]["scheduled_report_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          recipients?: string[]
          report_id?: string
          report_label?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kpi_id: string
          label: string
          sla_days: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          kpi_id: string
          label: string
          sla_days: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kpi_id?: string
          label?: string
          sla_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      source_reconciliation_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          event_payload: Json
          event_type: string
          id: string
          match_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type: string
          id?: string
          match_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type?: string
          id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_reconciliation_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_reconciliation_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_reconciliation_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "source_reconciliation_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      source_reconciliation_matches: {
        Row: {
          canonical_record_id: string | null
          canonical_table: string | null
          company_id: string
          confidence_score: number | null
          conflict_payload: Json
          created_at: string
          id: string
          match_basis: Json
          match_rule: string | null
          match_status: Database["public"]["Enums"]["source_reconciliation_match_match_status"]
          object_type: Database["public"]["Enums"]["source_reconciliation_match_object_type"]
          review_notes: string | null
          review_owner: string | null
          reviewed_at: string | null
          source_priority: number
          source_record_id: string
          source_system: Database["public"]["Enums"]["source_reconciliation_match_source_system"]
          source_table: string
          updated_at: string
        }
        Insert: {
          canonical_record_id?: string | null
          canonical_table?: string | null
          company_id: string
          confidence_score?: number | null
          conflict_payload?: Json
          created_at?: string
          id?: string
          match_basis?: Json
          match_rule?: string | null
          match_status?: Database["public"]["Enums"]["source_reconciliation_match_match_status"]
          object_type: Database["public"]["Enums"]["source_reconciliation_match_object_type"]
          review_notes?: string | null
          review_owner?: string | null
          reviewed_at?: string | null
          source_priority?: number
          source_record_id: string
          source_system: Database["public"]["Enums"]["source_reconciliation_match_source_system"]
          source_table: string
          updated_at?: string
        }
        Update: {
          canonical_record_id?: string | null
          canonical_table?: string | null
          company_id?: string
          confidence_score?: number | null
          conflict_payload?: Json
          created_at?: string
          id?: string
          match_basis?: Json
          match_rule?: string | null
          match_status?: Database["public"]["Enums"]["source_reconciliation_match_match_status"]
          object_type?: Database["public"]["Enums"]["source_reconciliation_match_object_type"]
          review_notes?: string | null
          review_owner?: string | null
          reviewed_at?: string | null
          source_priority?: number
          source_record_id?: string
          source_system?: Database["public"]["Enums"]["source_reconciliation_match_source_system"]
          source_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_reconciliation_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_reconciliation_matches_review_owner_fkey"
            columns: ["review_owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_events: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          event_type: Database["public"]["Enums"]["supplier_payment_event_event_type"]
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          purchase_invoice_id: string
          reference_no: string | null
          reversal_of_event_id: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          event_type: Database["public"]["Enums"]["supplier_payment_event_event_type"]
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          purchase_invoice_id: string
          reference_no?: string | null
          reversal_of_event_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: Database["public"]["Enums"]["supplier_payment_event_event_type"]
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          purchase_invoice_id?: string
          reference_no?: string | null
          reversal_of_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_events_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_events_reversal_of_event_id_fkey"
            columns: ["reversal_of_event_id"]
            isOneToOne: false
            referencedRelation: "supplier_payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          attn: string | null
          code: string | null
          company_address: string | null
          company_id: string
          company_reg_no: string | null
          contact_no: string | null
          created_at: string
          email: string | null
          id: string
          mailing_address: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          attn?: string | null
          code?: string | null
          company_address?: string | null
          company_id: string
          company_reg_no?: string | null
          contact_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mailing_address?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          attn?: string | null
          code?: string | null
          company_address?: string | null
          company_id?: string
          company_reg_no?: string | null
          contact_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mailing_address?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          page_cursor: string | null
          payload_hash: string | null
          record_count: number
          request_filters: Json
          source_endpoint: string | null
          source_system: Database["public"]["Enums"]["sync_run_source_system"]
          started_at: string
          status: Database["public"]["Enums"]["sync_run_status"]
          sync_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          page_cursor?: string | null
          payload_hash?: string | null
          record_count?: number
          request_filters?: Json
          source_endpoint?: string | null
          source_system: Database["public"]["Enums"]["sync_run_source_system"]
          started_at?: string
          status?: Database["public"]["Enums"]["sync_run_status"]
          sync_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          page_cursor?: string | null
          payload_hash?: string | null
          record_count?: number
          request_filters?: Json
          source_endpoint?: string | null
          source_system?: Database["public"]["Enums"]["sync_run_source_system"]
          started_at?: string
          status?: Database["public"]["Enums"]["sync_run_status"]
          sync_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_activity: {
        Row: {
          actor_id: string
          company_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["ticket_activity_event_type"]
          id: string
          message: string
          metadata: Json
          ticket_id: string
        }
        Insert: {
          actor_id: string
          company_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["ticket_activity_event_type"]
          id?: string
          message: string
          metadata?: Json
          ticket_id: string
        }
        Update: {
          actor_id?: string
          company_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["ticket_activity_event_type"]
          id?: string
          message?: string
          metadata?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type?: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_chat_reads: {
        Row: {
          company_id: string
          read_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          read_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          read_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_chat_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_closure_feedback: {
        Row: {
          company_id: string
          confirmed_resolved: boolean
          created_at: string
          feedback_comment: string | null
          id: string
          requester_id: string
          satisfaction_rating: number
          ticket_id: string
        }
        Insert: {
          company_id: string
          confirmed_resolved: boolean
          created_at?: string
          feedback_comment?: string | null
          id?: string
          requester_id: string
          satisfaction_rating: number
          ticket_id: string
        }
        Update: {
          company_id?: string
          confirmed_resolved?: boolean
          created_at?: string
          feedback_comment?: string | null
          id?: string
          requester_id?: string
          satisfaction_rating?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_closure_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_collaborators: {
        Row: {
          added_at: string
          added_by: string | null
          company_id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          company_id: string
          ticket_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          company_id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_collaborators_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_duplicate_links: {
        Row: {
          company_id: string
          created_at: string
          duplicate_of_ticket_id: string
          id: string
          linked_by: string
          ticket_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          duplicate_of_ticket_id: string
          id?: string
          linked_by: string
          ticket_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          duplicate_of_ticket_id?: string
          id?: string
          linked_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_duplicate_links_duplicate_of_ticket_id_fkey"
            columns: ["duplicate_of_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_duplicate_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_internal_notes: {
        Row: {
          author_id: string
          company_id: string
          created_at: string
          id: string
          mentions: string[]
          note: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          company_id: string
          created_at?: string
          id?: string
          mentions?: string[]
          note: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          company_id?: string
          created_at?: string
          id?: string
          mentions?: string[]
          note?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_internal_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          backup_owner_id: string | null
          business_impact: string | null
          category: string
          chassis_no: string | null
          closed_at: string | null
          closure_confirmed: boolean
          closure_feedback: string | null
          company_id: string
          completion_attachment_required: boolean
          completion_category: Database["public"]["Enums"]["ticket_completion_category"] | null
          completion_checklist_confirmed: boolean
          created_at: string
          current_responsible_party: string
          custom_fields: Json
          deal_id: string | null
          description: string
          desired_outcome: string | null
          escalation_owner_id: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          last_action_by: string | null
          last_reopen_reason: string | null
          next_action: string
          previous_owner_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          reopen_count: number
          reopened_at: string | null
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          responsible_queue: string
          satisfaction_rating: number | null
          sla_breach_reason: string | null
          sla_pause_duration_ms: number
          sla_paused_at: string | null
          sla_status: Database["public"]["Enums"]["ticket_sla_status"]
          status: Database["public"]["Enums"]["ticket_status"]
          status_changed_at: string
          subcategory: string | null
          subject: string
          submitted_by: string
          updated_at: string
          vso_number: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          backup_owner_id?: string | null
          business_impact?: string | null
          category?: string
          chassis_no?: string | null
          closed_at?: string | null
          closure_confirmed?: boolean
          closure_feedback?: string | null
          company_id: string
          completion_attachment_required?: boolean
          completion_category?: Database["public"]["Enums"]["ticket_completion_category"] | null
          completion_checklist_confirmed?: boolean
          created_at?: string
          current_responsible_party?: string
          custom_fields?: Json
          deal_id?: string | null
          description: string
          desired_outcome?: string | null
          escalation_owner_id?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          last_action_by?: string | null
          last_reopen_reason?: string | null
          next_action?: string
          previous_owner_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reopen_count?: number
          reopened_at?: string | null
          requested_due_date?: string | null
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          responsible_queue?: string
          satisfaction_rating?: number | null
          sla_breach_reason?: string | null
          sla_pause_duration_ms?: number
          sla_paused_at?: string | null
          sla_status?: Database["public"]["Enums"]["ticket_sla_status"]
          status?: Database["public"]["Enums"]["ticket_status"]
          status_changed_at?: string
          subcategory?: string | null
          subject: string
          submitted_by: string
          updated_at?: string
          vso_number?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          backup_owner_id?: string | null
          business_impact?: string | null
          category?: string
          chassis_no?: string | null
          closed_at?: string | null
          closure_confirmed?: boolean
          closure_feedback?: string | null
          company_id?: string
          completion_attachment_required?: boolean
          completion_category?: Database["public"]["Enums"]["ticket_completion_category"] | null
          completion_checklist_confirmed?: boolean
          created_at?: string
          current_responsible_party?: string
          custom_fields?: Json
          deal_id?: string | null
          description?: string
          desired_outcome?: string | null
          escalation_owner_id?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          last_action_by?: string | null
          last_reopen_reason?: string | null
          next_action?: string
          previous_owner_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reopen_count?: number
          reopened_at?: string | null
          requested_due_date?: string | null
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          responsible_queue?: string
          satisfaction_rating?: number | null
          sla_breach_reason?: string | null
          sla_pause_duration_ms?: number
          sla_paused_at?: string | null
          sla_status?: Database["public"]["Enums"]["ticket_sla_status"]
          status?: Database["public"]["Enums"]["ticket_status"]
          status_changed_at?: string
          subcategory?: string | null
          subject?: string
          submitted_by?: string
          updated_at?: string
          vso_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_backup_owner_id_fkey"
            columns: ["backup_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_escalation_owner_id_fkey"
            columns: ["escalation_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_last_action_by_fkey"
            columns: ["last_action_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_previous_owner_id_fkey"
            columns: ["previous_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tin_types: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_colours: {
        Row: {
          code: string
          company_id: string
          created_at: string
          hex: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          hex?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          hex?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          base_price: number | null
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          base_price?: number | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          base_price?: number | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicle_transfers: {
        Row: {
          arrived_at: string | null
          chassis_no: string
          colour: string | null
          company_id: string
          created_at: string
          from_branch: string
          id: string
          model: string
          remark: string | null
          running_no: string
          status: Database["public"]["Enums"]["vehicle_transfer_status"]
          to_branch: string
        }
        Insert: {
          arrived_at?: string | null
          chassis_no: string
          colour?: string | null
          company_id: string
          created_at?: string
          from_branch: string
          id?: string
          model: string
          remark?: string | null
          running_no: string
          status?: Database["public"]["Enums"]["vehicle_transfer_status"]
          to_branch: string
        }
        Update: {
          arrived_at?: string | null
          chassis_no?: string
          colour?: string | null
          company_id?: string
          created_at?: string
          from_branch?: string
          id?: string
          model?: string
          remark?: string | null
          running_no?: string
          status?: Database["public"]["Enums"]["vehicle_transfer_status"]
          to_branch?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_user_id: string | null
          bg_date: string | null
          bg_to_delivery: number | null
          bg_to_disb: number | null
          bg_to_shipment_etd: number | null
          branch_code: string
          branch_name: string | null
          chassis_no: string
          color: string | null
          colour: string | null
          commission_paid: boolean | null
          commission_paid_at: string | null
          commission_remark: string | null
          company_branch_id: string | null
          company_id: string
          contra_sola: string | null
          created_at: string
          customer_name: string
          date_received_by_outlet: string | null
          dealer_transfer_price: string | null
          deleted_at: string | null
          delivery_date: string | null
          delivery_to_disb: number | null
          disb_date: string | null
          dms_last_synced_at: string | null
          dms_so_no: string | null
          dms_vs_stock_id: string | null
          engine_no: string | null
          etd_to_outlet: number | null
          full_payment_date: string | null
          full_payment_type: string | null
          id: string
          import_batch_id: string | null
          invoice_no: string | null
          is_d2d: boolean
          is_deleted: boolean
          legacy_id: string | null
          lou: string | null
          model: string
          model_code: string | null
          obr: string | null
          outlet_to_reg: number | null
          payment_method: string
          reg_date: string | null
          reg_no: string | null
          reg_to_delivery: number | null
          remark: string | null
          salesman_id: string | null
          salesman_name: string
          shipment_eta_kk_twu_sdk: string | null
          shipment_etd_pkg: string | null
          shipment_name: string | null
          source_row_id: string | null
          stage: Database["public"]["Enums"]["vehicle_stage"] | null
          stage_override: Database["public"]["Enums"]["vehicle_stage_override"] | null
          status: string | null
          updated_at: string
          vaa_date: string | null
          variant: string | null
          year_model: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          branch_name?: string | null
          chassis_no: string
          color?: string | null
          colour?: string | null
          commission_paid?: boolean | null
          commission_paid_at?: string | null
          commission_remark?: string | null
          company_branch_id?: string | null
          company_id?: string
          contra_sola?: string | null
          created_at?: string
          customer_name?: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          dms_last_synced_at?: string | null
          dms_so_no?: string | null
          dms_vs_stock_id?: string | null
          engine_no?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          is_deleted?: boolean
          legacy_id?: string | null
          lou?: string | null
          model?: string
          model_code?: string | null
          obr?: string | null
          outlet_to_reg?: number | null
          payment_method?: string
          reg_date?: string | null
          reg_no?: string | null
          reg_to_delivery?: number | null
          remark?: string | null
          salesman_id?: string | null
          salesman_name?: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          stage?: Database["public"]["Enums"]["vehicle_stage"] | null
          stage_override?: Database["public"]["Enums"]["vehicle_stage_override"] | null
          status?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
          year_model?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          branch_name?: string | null
          chassis_no?: string
          color?: string | null
          colour?: string | null
          commission_paid?: boolean | null
          commission_paid_at?: string | null
          commission_remark?: string | null
          company_branch_id?: string | null
          company_id?: string
          contra_sola?: string | null
          created_at?: string
          customer_name?: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          dms_last_synced_at?: string | null
          dms_so_no?: string | null
          dms_vs_stock_id?: string | null
          engine_no?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          is_deleted?: boolean
          legacy_id?: string | null
          lou?: string | null
          model?: string
          model_code?: string | null
          obr?: string | null
          outlet_to_reg?: number | null
          payment_method?: string
          reg_date?: string | null
          reg_no?: string | null
          reg_to_delivery?: number | null
          remark?: string | null
          salesman_id?: string | null
          salesman_name?: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          stage?: Database["public"]["Enums"]["vehicle_stage"] | null
          stage_override?: Database["public"]["Enums"]["vehicle_stage_override"] | null
          status?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
          year_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          company_id: string
          consecutive_failures: number
          created_at: string
          created_by: string | null
          event_types: string[]
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          company_id: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          company_id?: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_outbox: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_type: string
          id: string
          last_error: string | null
          last_response_status: number | null
          next_retry_at: string
          payload: Json
          status: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_type: string
          id?: string
          last_error?: string | null
          last_response_status?: number | null
          next_retry_at?: string
          payload: Json
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          last_response_status?: number | null
          next_retry_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_outbox_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dms_normalizer_eligible_records: {
        Row: {
          canonical_record_id: string | null
          canonical_table: string | null
          company_id: string | null
          confidence_score: number | null
          match_basis: Json | null
          match_rule: string | null
          match_status: string | null
          object_type: string | null
          review_notes: string | null
          reviewed_at: string | null
          source_priority: number | null
          source_record_id: string | null
          source_system: string | null
          source_table: string | null
        }
        Insert: {
          canonical_record_id?: string | null
          canonical_table?: string | null
          company_id?: string | null
          confidence_score?: number | null
          match_basis?: Json | null
          match_rule?: string | null
          match_status?: string | null
          object_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          source_priority?: number | null
          source_record_id?: string | null
          source_system?: string | null
          source_table?: string | null
        }
        Update: {
          canonical_record_id?: string | null
          canonical_table?: string | null
          company_id?: string | null
          confidence_score?: number | null
          match_basis?: Json | null
          match_rule?: string | null
          match_status?: string | null
          object_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          source_priority?: number | null
          source_record_id?: string | null
          source_system?: string | null
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_reconciliation_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_lead_followup: {
        Args: {
          p_company_id: string
          p_next_action_date?: string | null
          p_notes: string
          p_outcome?: string | null
          p_source_kind: string
          p_source_raw_id: string
        }
        Returns: string
      }
      auto_aging_dashboard_summary: {
        Args: {
          p_branch?: string
          p_from?: string
          p_model?: string
          p_to?: string
        }
        Returns: Json
      }
      auto_aging_report: {
        Args: {
          p_bg_date_from?: string
          p_bg_date_to?: string
          p_branch?: string
          p_limit?: number
          p_model?: string
          p_offset?: number
          p_report_type: string
        }
        Returns: Json
      }
      auto_aging_source_ledger: {
        Args: {
          p_bg_date_from?: string
          p_bg_date_to?: string
          p_branch?: string
          p_limit?: number
          p_model?: string
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      auto_close_resolved_tickets: { Args: never; Returns: number }
      bump_rate_limit: {
        Args: {
          p_action: string
          p_caller_id: string
          p_max_calls: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      can_access_row: {
        Args: {
          row_assigned_user_id?: string
          row_branch_code?: string
          row_company_id: string
        }
        Returns: boolean
      }
      can_read_profile: {
        Args: { target_company_id: string; target_id: string }
        Returns: boolean
      }
      cancel_own_ticket: {
        Args: { p_cancellation_note?: string | null; p_ticket_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          backup_owner_id: string | null
          business_impact: string | null
          category: string
          chassis_no: string | null
          closed_at: string | null
          closure_confirmed: boolean
          closure_feedback: string | null
          company_id: string
          completion_attachment_required: boolean
          completion_category: string | null
          completion_checklist_confirmed: boolean
          created_at: string
          current_responsible_party: string
          custom_fields: Json
          deal_id: string | null
          description: string
          desired_outcome: string | null
          escalation_owner_id: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          last_action_by: string | null
          last_reopen_reason: string | null
          next_action: string
          previous_owner_id: string | null
          priority: string
          reopen_count: number
          reopened_at: string | null
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          responsible_queue: string
          satisfaction_rating: number | null
          sla_breach_reason: string | null
          sla_pause_duration_ms: number
          sla_paused_at: string | null
          sla_status: string
          status: string
          status_changed_at: string
          subcategory: string | null
          subject: string
          submitted_by: string
          updated_at: string
          vso_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_import_batch: {
        Args: {
          p_batch_id: string
          p_error_rows: number
          p_quality_issues: Json
          p_valid_rows: number
          p_vehicles: Json
        }
        Returns: Json
      }
      create_sales_advisor_employee: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_contact_no?: string | null
          p_ic_no?: string | null
          p_join_date?: string | null
          p_name: string
          p_staff_code: string
          p_work_email?: string | null
        }
        Returns: string
      }
      create_grn: {
        Args: {
          p_company_id: string
          p_grn_no: string
          p_lines: Json
          p_notes: string | null
          p_po_id: string
          p_received_date: string
          p_supplier_dn_no: string | null
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_company_id: string
          p_expected_delivery_date: string | null
          p_lines: Json
          p_notes: string | null
          p_order_date: string
          p_po_no: string
          p_supplier: string
        }
        Returns: string
      }
      current_access_scope: { Args: never; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      decide_reconciliation_match: {
        Args: {
          p_company_id: string
          p_decision: string
          p_match_id: string
          p_notes?: string | null
        }
        Returns: string
      }
      emit_webhook_event: {
        Args: { p_company_id: string; p_event_type: string; p_payload: Json }
        Returns: number
      }
      generate_deal_no:
        | {
            Args: { p_branch_id: string | null; p_company_id: string }
            Returns: string
          }
        | {
            Args: { p_branch_id: string | null; p_company_id: string }
            Returns: string
          }
      get_ap_aging_by_branch: {
        Args: { p_company_id: string }
        Returns: {
          branch_code: string
          bucket: string
          invoice_count: number
          overdue_amount: number
          total_outstanding: number
        }[]
      }
      get_ap_aging_summary: {
        Args: { p_company_id: string }
        Returns: {
          bucket: string
          invoice_count: number
          overdue_amount: number
          total_outstanding: number
        }[]
      }
      get_ar_aging_by_branch: {
        Args: { p_company_id: string }
        Returns: {
          branch_code: string
          bucket: string
          invoice_count: number
          overdue_amount: number
          total_outstanding: number
        }[]
      }
      get_ar_aging_summary: {
        Args: { p_company_id: string }
        Returns: {
          bucket: string
          invoice_count: number
          overdue_amount: number
          total_outstanding: number
        }[]
      }
      get_balance_sheet: {
        Args: { p_company_id: string; p_period_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          balance: number
        }[]
      }
      get_cash_position: {
        Args: { p_company_id: string; p_from_date: string; p_to_date: string }
        Returns: {
          daily_credit: number
          daily_debit: number
          daily_net: number
          position_date: string
          running_balance: number
        }[]
      }
      get_dms_raw_staging_counts: {
        Args: { p_company_id: string }
        Returns: {
          latest_fetched_at: string
          normalized_rows: number
          pending_rows: number
          table_name: string
          total_rows: number
        }[]
      }
      get_dms_sync_runs_summary: {
        Args: { p_company_id: string }
        Returns: {
          failed_runs: number
          last_run_at: string
          last_run_status: string
          pending_runs: number
          running_runs: number
          source_system: string
          succeeded_runs: number
          total_record_count: number
          total_runs: number
        }[]
      }
      get_lead_detail: {
        Args: { p_company_id: string; p_raw_id: string; p_source_kind: string }
        Returns: {
          branch_code: string
          dms_customer_id: string
          dms_external_id: string
          fetched_at: string
          followups: Json
          raw_payload: Json
          salesperson_code: string
          source_created_at: string
          source_kind: string
          source_raw_id: string
          status: string
        }[]
      }
      get_leads_feed: {
        Args: {
          p_branch_code?: string | null
          p_company_id: string
          p_kind?: string | null
          p_limit?: number
          p_status?: string | null
        }
        Returns: {
          branch_code: string
          dms_customer_id: string
          dms_external_id: string
          fetched_at: string
          followup_count: number
          last_followup_at: string
          last_followup_outcome: string
          next_action_date: string
          salesperson_code: string
          source_created_at: string
          source_kind: string
          source_raw_id: string
          status: string
        }[]
      }
      get_my_access_scope: {
        Args: never
        Returns: {
          user_access_scope: string
          user_branch_id: string
          user_company_id: string
          user_role: string
        }[]
      }
      get_payment_events: {
        Args: { p_invoice_id: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          event_type: string
          id: string
          is_reversed: boolean
          notes: string
          payment_date: string
          payment_method: string
          receipt_reference: string
          reversal_of_event_id: string
        }[]
      }
      get_period_close_summary: {
        Args: { p_company_id: string; p_period_id: string }
        Returns: {
          journal_entry_count: number
          open_ap_invoice_count: number
          open_ap_invoice_outstanding: number
          open_ar_invoice_count: number
          open_ar_invoice_outstanding: number
          period_end_date: string
          period_start_date: string
          period_status: string
          total_credit: number
          total_debit: number
          unposted_ap_payment_amount: number
          unposted_ap_payment_count: number
          unposted_ar_payment_amount: number
          unposted_ar_payment_count: number
        }[]
      }
      get_period_close_unposted: {
        Args: { p_company_id: string; p_period_id: string }
        Returns: {
          amount: number
          document_id: string
          event_id: string
          kind: string
          payment_date: string
          reference: string
        }[]
      }
      get_po_line_receipts: {
        Args: { p_company_id: string; p_po_id: string }
        Returns: {
          chassis_no: string
          line_no: number
          model: string
          ordered_quantity: number
          purchase_order_line_id: string
          received_quantity: number
          remaining_quantity: number
          variant: string
        }[]
      }
      get_profit_loss: {
        Args: { p_company_id: string; p_period_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          amount: number
        }[]
      }
      get_reconciliation_match_detail: {
        Args: { p_company_id: string; p_match_id: string }
        Returns: {
          canonical_payload: Json
          canonical_record_id: string
          canonical_table: string
          confidence_score: number
          conflict_payload: Json
          created_at: string
          id: string
          match_basis: Json
          match_rule: string
          match_status: string
          object_type: string
          review_notes: string
          review_owner: string
          reviewed_at: string
          source_payload: Json
          source_priority: number
          source_record_id: string
          source_system: string
          source_table: string
          updated_at: string
        }[]
      }
      get_reconciliation_queue: {
        Args: {
          p_company_id: string
          p_limit?: number
          p_match_status?: string | null
          p_object_type?: string | null
        }
        Returns: {
          canonical_record_id: string
          canonical_table: string
          confidence_score: number
          created_at: string
          id: string
          match_rule: string
          match_status: string
          object_type: string
          review_owner: string
          reviewed_at: string
          source_priority: number
          source_record_id: string
          source_system: string
          source_table: string
          updated_at: string
        }[]
      }
      get_reconciliation_status_counts: {
        Args: { p_company_id: string }
        Returns: {
          match_status: string
          total: number
        }[]
      }
      get_role_home_kpis: {
        Args: { p_company_id: string; p_role: string }
        Returns: {
          code: string
          description: string
          formula: Json
          label: string
          landing_route: string
          position: number
        }[]
      }
      get_sales_dashboard_summary: {
        Args: { p_branch_code?: string | null; p_company_id: string }
        Returns: Json
      }
      get_sales_pipeline_summary: {
        Args: {
          p_branch_code?: string | null
          p_company_id: string
          p_from_date?: string | null
          p_to_date?: string | null
        }
        Returns: Json
      }
      get_supplier_payment_events: {
        Args: { p_purchase_invoice_id: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          event_type: string
          id: string
          is_reversed: boolean
          notes: string
          payment_date: string
          payment_method: string
          reference_no: string
          reversal_of_event_id: string
        }[]
      }
      get_three_way_match_queue: {
        Args: {
          p_company_id: string
          p_limit?: number
          p_match_status?: string | null
        }
        Returns: {
          amount_variance: number
          chassis_no: string
          expected_amount: number
          invoice_date: string
          invoice_no: string
          match_status: string
          ordered_quantity: number
          pi_amount: number
          po_line_no: number
          po_no: string
          purchase_invoice_id: string
          received_quantity: number
          supplier: string
        }[]
      }
      get_three_way_match_status: {
        Args: { p_company_id: string; p_pi_id: string }
        Returns: {
          amount_variance: number
          chassis_no: string
          expected_amount: number
          invoice_no: string
          match_status: string
          ordered_quantity: number
          pi_amount: number
          po_id: string
          po_line_id: string
          po_line_no: number
          po_no: string
          purchase_invoice_id: string
          received_quantity: number
          supplier: string
          unit_price: number
        }[]
      }
      get_three_way_match_status_counts: {
        Args: { p_company_id: string }
        Returns: {
          match_status: string
          total: number
        }[]
      }
      get_trial_balance: {
        Args: { p_company_id: string; p_period_id: string | null }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          net_balance: number
          total_credit: number
          total_debit: number
        }[]
      }
      global_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          description: string
          entity_id: string
          entity_type: string
          href: string
          label: string
          rank_score: number
        }[]
      }
      is_same_company: { Args: { target_company_id: string }; Returns: boolean }
      link_vehicle_to_sales_order: {
        Args: {
          p_chassis_no?: string
          p_sales_order_id: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      mark_sync_run_for_retry: {
        Args: { p_company_id: string; p_run_id: string }
        Returns: string
      }
      normalize_dms_customer: { Args: { p_raw_id: string }; Returns: Json }
      normalize_dms_sales_order: { Args: { p_raw_id: string }; Returns: Json }
      normalize_dms_vehicle_stock: {
        Args: { p_delivery_id?: string; p_raw_id: string }
        Returns: Json
      }
      post_ap_payment_to_gl: {
        Args: { p_supplier_payment_event_id: string }
        Returns: string
      }
      post_ar_payment_to_gl: {
        Args: { p_payment_event_id: string }
        Returns: string
      }
      reassign_ticket: {
        Args: {
          p_company_id: string
          p_new_owner_id: string
          p_ticket_id: string
          p_transition_note: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          backup_owner_id: string | null
          business_impact: string | null
          category: string
          chassis_no: string | null
          closed_at: string | null
          closure_confirmed: boolean
          closure_feedback: string | null
          company_id: string
          completion_attachment_required: boolean
          completion_category: string | null
          completion_checklist_confirmed: boolean
          created_at: string
          current_responsible_party: string
          custom_fields: Json
          deal_id: string | null
          description: string
          desired_outcome: string | null
          escalation_owner_id: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          last_action_by: string | null
          last_reopen_reason: string | null
          next_action: string
          previous_owner_id: string | null
          priority: string
          reopen_count: number
          reopened_at: string | null
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          responsible_queue: string
          satisfaction_rating: number | null
          sla_breach_reason: string | null
          sla_pause_duration_ms: number
          sla_paused_at: string | null
          sla_status: string
          status: string
          status_changed_at: string
          subcategory: string | null
          subject: string
          submitted_by: string
          updated_at: string
          vso_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment_event: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_notes?: string | null
          p_official_receipt_id?: string | null
          p_payment_date: string
          p_payment_method?: string | null
          p_receipt_reference?: string | null
        }
        Returns: string
      }
      record_supplier_payment_event: {
        Args: {
          p_amount: number
          p_notes?: string | null
          p_payment_date: string
          p_payment_method?: string | null
          p_purchase_invoice_id: string
          p_reference_no?: string | null
        }
        Returns: string
      }
      requeue_webhook_delivery: { Args: { p_id: string }; Returns: boolean }
      reverse_payment_event: {
        Args: { p_event_id: string; p_reason?: string | null }
        Returns: string
      }
      reverse_supplier_payment_event: {
        Args: { p_event_id: string; p_reason?: string | null }
        Returns: string
      }
      search_vehicles: {
        Args: {
          p_bg_date_from?: string | null
          p_bg_date_to?: string | null
          p_branch?: string | null
          p_has_delivery_date?: boolean | null
          p_limit?: number
          p_model?: string | null
          p_offset?: number
          p_payment?: string | null
          p_search?: string | null
          p_sort_column?: string
          p_sort_direction?: string
          p_stage?: string | null
        }
        Returns: {
          rows: Json
          total_count: number
        }[]
      }
      seed_source_reconciliation_candidates: {
        Args: { p_company_id?: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      ticket_reply_and_wait: {
        Args: { p_company_id: string; p_message: string; p_ticket_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          backup_owner_id: string | null
          business_impact: string | null
          category: string
          chassis_no: string | null
          closed_at: string | null
          closure_confirmed: boolean
          closure_feedback: string | null
          company_id: string
          completion_attachment_required: boolean
          completion_category: string | null
          completion_checklist_confirmed: boolean
          created_at: string
          current_responsible_party: string
          custom_fields: Json
          deal_id: string | null
          description: string
          desired_outcome: string | null
          escalation_owner_id: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          last_action_by: string | null
          last_reopen_reason: string | null
          next_action: string
          previous_owner_id: string | null
          priority: string
          reopen_count: number
          reopened_at: string | null
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          responsible_queue: string
          satisfaction_rating: number | null
          sla_breach_reason: string | null
          sla_pause_duration_ms: number
          sla_paused_at: string | null
          sla_status: string
          status: string
          status_changed_at: string
          subcategory: string | null
          subject: string
          submitted_by: string
          updated_at: string
          vso_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_pi_lifecycle: {
        Args: { p_actor_id?: string | null; p_id: string; p_target_status: string }
        Returns: string
      }
      transition_po_status: {
        Args: { p_company_id: string; p_id: string; p_target_status: string }
        Returns: string
      }
      transition_sales_order_stage: {
        Args: {
          p_actor_id?: string | null
          p_company_id: string
          p_order_id: string
          p_stage_id: string | null
        }
        Returns: Json
      }
      unlink_vehicle_from_sales_order: {
        Args: { p_sales_order_id: string }
        Returns: Json
      }
      upsert_role_kpi_defaults: {
        Args: { p_company_id: string; p_kpi_codes: string[]; p_role: string }
        Returns: string
      }
      upsert_webhook_endpoint: {
        Args: {
          p_active: boolean
          p_company_id: string
          p_event_types: string[]
          p_id: string | null
          p_name: string
          p_secret: string
          p_url: string
        }
        Returns: string
      }
      vehicle_kpi_summary: { Args: { p_branch?: string | null }; Returns: Json }
    }
    Enums: {
    webhook_delivery_status:
      | "pending"
      | "delivering"
      | "delivered"
      | "failed"
      | "dead",
    accounting_period_status:
      | "open"
      | "closed"
      | "locked",
    account_type:
      | "asset"
      | "liability"
      | "equity"
      | "revenue"
      | "expense",
    announcement_category:
      | "general"
      | "policy"
      | "event"
      | "emergency"
      | "holiday",
    announcement_priority:
      | "low"
      | "normal"
      | "high"
      | "urgent",
    appraisal_item_status:
      | "pending"
      | "self_reviewed"
      | "reviewed"
      | "acknowledged",
    appraisal_cycle:
      | "annual"
      | "mid_year"
      | "quarterly"
      | "probation",
    appraisal_status:
      | "open"
      | "in_progress"
      | "completed"
      | "archived",
    approval_decision:
      | "approved"
      | "rejected",
    approval_flow_entity_type:
      | "leave_request"
      | "payroll_run"
      | "appraisal"
      | "internal_request"
      | "general",
    approval_instance_entity_type:
      | "leave_request"
      | "payroll_run"
      | "appraisal"
      | "internal_request"
      | "general",
    approval_instance_status:
      | "pending"
      | "approved"
      | "rejected"
      | "cancelled",
    approval_request_entity_type:
      | "leave_request"
      | "payroll_run"
      | "appraisal"
      | "internal_request"
      | "general",
    approval_request_status:
      | "pending"
      | "approved"
      | "rejected"
      | "cancelled",
    approval_step_approver_type:
      | "role"
      | "specific_user"
      | "direct_manager",
    attendance_record_status:
      | "present"
      | "absent"
      | "half_day"
      | "on_leave"
      | "public_holiday",
    column_permission_permission_level:
      | "none"
      | "view"
      | "edit",
    commission_record_status:
      | "pending"
      | "approved"
      | "paid",
    customer_communication_type:
      | "call"
      | "email"
      | "visit"
      | "message"
      | "meeting"
      | "note",
    deal_insurance_status:
      | "pending"
      | "cover_note_issued"
      | "policy_active"
      | "expired",
    deal_loan_status:
      | "pending"
      | "submitted"
      | "approved"
      | "rejected"
      | "lou_issued"
      | "lou_verified"
      | "disbursed",
    deal_registration_status:
      | "pending"
      | "submitted"
      | "registered"
      | "plate_received",
    deal_stage:
      | "lead"
      | "prospect"
      | "booking"
      | "loan_submission"
      | "lou"
      | "shipment"
      | "receive"
      | "registration"
      | "delivery"
      | "disbursement"
      | "completed",
    employee_module_assignment_source:
      | "manual"
      | "migration"
      | "sync",
    employee_primary_role:
      | "super_admin"
      | "company_admin"
      | "director"
      | "general_manager"
      | "manager"
      | "sales"
      | "accounts"
      | "analyst"
      | "creator_updater",
    employee_status:
      | "active"
      | "inactive"
      | "resigned"
      | "pending",
    hrms_role_category:
      | "executive"
      | "hr"
      | "department"
      | "line_management"
      | "staff"
      | "employee"
      | "payroll"
      | "attendance"
      | "custom",
    hrms_role_scope:
      | "company"
      | "branch"
      | "department"
      | "self",
    import_review_row_review_reason:
      | "incomplete"
      | "blocking"
      | "mixed",
    import_review_row_review_status:
      | "pending"
      | "in_review"
      | "resolved"
      | "discarded",
    invoice_invoice_type:
      | "customer_sales"
      | "dealer_sales"
      | "purchase",
    invoice_payment_status:
      | "unpaid"
      | "partial"
      | "paid",
    invoice_reconciliation_status:
      | "pending"
      | "reconciled"
      | "disputed"
      | "override",
    invoice_source_type:
      | "ubs_local"
      | "dms_snapshot"
      | "legacy_backfill",
    job_title_level:
      | "junior"
      | "mid"
      | "senior"
      | "lead"
      | "executive",
    journal_entry_source_type:
      | "ar_payment"
      | "ap_payment"
      | "manual"
      | "adjustment",
    lead_followup_outcome:
      | "contacted"
      | "no_answer"
      | "callback_scheduled"
      | "not_interested"
      | "qualified"
      | "converted"
      | "lost",
    lead_followup_source_kind:
      | "lead"
      | "prospect",
    leave_quota_rule_period_type:
      | "daily"
      | "weekly"
      | "monthly"
      | "date_range",
    leave_request_day_part:
      | "full_day"
      | "half_day_morning"
      | "half_day_afternoon",
    leave_request_status:
      | "pending"
      | "approved"
      | "rejected"
      | "cancelled",
    legacy_staging_record_record_type:
      | "purchase_invoice"
      | "dealer_invoice"
      | "staff"
      | "branch"
      | "advisor"
      | "bank"
      | "supplier"
      | "dealer"
      | "model"
      | "color"
      | "finance_company"
      | "payment_type",
    loan_application_status:
      | "pending"
      | "approved"
      | "rejected"
      | "disbursed",
    normalizer_column_authority_authority:
      | "dms"
      | "legacy_fookloi"
      | "ubs_local"
      | "ubs_plus_dms",
    normalizer_column_authority_overwrite_rule:
      | "always"
      | "if_null"
      | "if_null_or_older"
      | "never"
      | "conflict_review",
    notification_type:
      | "info"
      | "warning"
      | "success"
      | "error",
    payment_event_event_type:
      | "payment"
      | "reversal"
      | "write_off"
      | "adjustment",
    payroll_run_status:
      | "draft"
      | "finalised"
      | "paid",
    portal_announcement_announcement_type:
      | "general"
      | "process_update"
      | "reminder"
      | "policy_note"
      | "maintenance"
      | "deadline",
    portal_announcement_audience_scope:
      | "all"
      | "admin_approver"
      | "requester_staff",
    portal_announcement_priority:
      | "low"
      | "normal"
      | "high"
      | "urgent",
    portal_announcement_status:
      | "draft"
      | "published"
      | "archived",
    portal_document_category:
      | "form"
      | "template"
      | "sop"
      | "guideline"
      | "checklist"
      | "policy"
      | "general",
    portal_document_status:
      | "active"
      | "inactive"
      | "archived",
    portal_document_visibility_scope:
      | "all"
      | "admin_approver"
      | "requester_staff",
    profile_role:
      | "super_admin"
      | "company_admin"
      | "director"
      | "general_manager"
      | "manager"
      | "sales"
      | "accounts"
      | "analyst"
      | "creator_updater"
      | "portal_admin"
      | "portal_manager"
      | "portal_staff",
    profile_status:
      | "active"
      | "inactive"
      | "resigned"
      | "pending",
    public_holiday_holiday_type:
      | "public"
      | "company",
    purchase_invoice_lifecycle_status:
      | "received"
      | "verified"
      | "approved"
      | "scheduled"
      | "paid"
      | "cancelled",
    purchase_invoice_payment_status:
      | "unpaid"
      | "partial"
      | "paid",
    purchase_invoice_status:
      | "pending"
      | "received"
      | "cancelled",
    purchase_order_lifecycle_status:
      | "draft"
      | "submitted"
      | "approved"
      | "fulfilled"
      | "closed"
      | "cancelled",
    push_token_platform:
      | "ios"
      | "android"
      | "web",
    request_form_field_data_source:
      | "branches"
      | "employees"
      | "vehicles"
      | null,
    request_form_field_field_type:
      | "text"
      | "textarea"
      | "number"
      | "date"
      | "database_select"
      | "select"
      | "multiselect"
      | "checkbox"
      | "radio"
      | "file",
    request_module_setting_sla_start_event:
      | "submitted"
      | "assigned",
    request_saved_filter_scope:
      | "queue"
      | "reports",
    sales_activity_activity_type:
      | "call"
      | "email"
      | "meeting"
      | "task"
      | "note",
    scheduled_report_date_range:
      | "last_7_days"
      | "last_30_days"
      | "last_month"
      | "current_month",
    scheduled_report_frequency:
      | "daily"
      | "weekly"
      | "monthly",
    source_reconciliation_match_match_status:
      | "candidate"
      | "auto_matched"
      | "accepted"
      | "conflict"
      | "ignored"
      | "rejected",
    source_reconciliation_match_object_type:
      | "sales_order"
      | "vehicle"
      | "customer"
      | "invoice_payment_evidence",
    source_reconciliation_match_source_system:
      | "dms"
      | "legacy_fookloi"
      | "google_sheets"
      | "ubs",
    supplier_payment_event_event_type:
      | "payment"
      | "reversal"
      | "write_off"
      | "adjustment",
    sync_run_source_system:
      | "dms"
      | "legacy_fookloi"
      | "google_sheets"
      | "manual",
    sync_run_status:
      | "pending"
      | "running"
      | "succeeded"
      | "failed"
      | "cancelled",
    ticket_activity_event_type:
      | "status_changed"
      | "owner_changed"
      | "resolution_note_updated"
      | "priority_changed"
      | "comment_added"
      | "request_created"
      | "category_changed"
      | "subcategory_changed"
      | "sla_paused"
      | "sla_resumed"
      | "sla_breached"
      | "requester_update_submitted"
      | "owner_requested_more_information"
      | "owner_completed_request"
      | "requester_closed_request"
      | "attachment_added"
      | "escalation_triggered"
      | "admin_manual_override"
      | "internal_note_added"
      | "duplicate_linked"
      | "request_reopened"
      | "closure_feedback_submitted"
      | "bulk_action_performed"
      | "report_exported"
      | "saved_filter_changed"
      | "configuration_changed",
    ticket_completion_category:
      | "resolved"
      | "partially_resolved"
      | "escalated"
      | "transferred"
      | "no_action_needed"
      | "other"
      | "rejected"
      | "duplicate"
      | "cancelled"
      | "not_applicable"
      | null,
    ticket_priority:
      | "low"
      | "medium"
      | "high",
    ticket_sla_status:
      | "on_track"
      | "at_risk"
      | "breached"
      | "paused",
    ticket_status:
      | "open"
      | "in_progress"
      | "pending_requester"
      | "pending_owner_review"
      | "completed_by_owner"
      | "closed"
      | "reopened"
      | "cancelled",
    vehicle_transfer_status:
      | "pending"
      | "in_transit"
      | "arrived"
      | "cancelled",
    vehicle_stage:
      | "pending_register_free_stock"
      | "pending_deliver_loan_disburse"
      | "complete"
      | null,
    vehicle_stage_override:
      | "pending_register_free_stock"
      | "pending_deliver_loan_disburse"
      | "complete"
      | null
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      webhook_delivery_status: ["pending", "delivering", "delivered", "failed", "dead"],
      accounting_period_status: ["open", "closed", "locked"],
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      announcement_category: ["general", "policy", "event", "emergency", "holiday"],
      announcement_priority: ["low", "normal", "high", "urgent"],
      appraisal_item_status: ["pending", "self_reviewed", "reviewed", "acknowledged"],
      appraisal_cycle: ["annual", "mid_year", "quarterly", "probation"],
      appraisal_status: ["open", "in_progress", "completed", "archived"],
      approval_decision: ["approved", "rejected"],
      approval_flow_entity_type: ["leave_request", "payroll_run", "appraisal", "internal_request", "general"],
      approval_instance_entity_type: ["leave_request", "payroll_run", "appraisal", "internal_request", "general"],
      approval_instance_status: ["pending", "approved", "rejected", "cancelled"],
      approval_request_entity_type: ["leave_request", "payroll_run", "appraisal", "internal_request", "general"],
      approval_request_status: ["pending", "approved", "rejected", "cancelled"],
      approval_step_approver_type: ["role", "specific_user", "direct_manager"],
      attendance_record_status: ["present", "absent", "half_day", "on_leave", "public_holiday"],
      column_permission_permission_level: ["none", "view", "edit"],
      commission_record_status: ["pending", "approved", "paid"],
      customer_communication_type: ["call", "email", "visit", "message", "meeting", "note"],
      deal_insurance_status: ["pending", "cover_note_issued", "policy_active", "expired"],
      deal_loan_status: ["pending", "submitted", "approved", "rejected", "lou_issued", "lou_verified", "disbursed"],
      deal_registration_status: ["pending", "submitted", "registered", "plate_received"],
      deal_stage: ["lead", "prospect", "booking", "loan_submission", "lou", "shipment", "receive", "registration", "delivery", "disbursement", "completed"],
      employee_module_assignment_source: ["manual", "migration", "sync"],
      employee_primary_role: ["super_admin", "company_admin", "director", "general_manager", "manager", "sales", "accounts", "analyst", "creator_updater"],
      employee_status: ["active", "inactive", "resigned", "pending"],
      hrms_role_category: ["executive", "hr", "department", "line_management", "staff", "employee", "payroll", "attendance", "custom"],
      hrms_role_scope: ["company", "branch", "department", "self"],
      import_review_row_review_reason: ["incomplete", "blocking", "mixed"],
      import_review_row_review_status: ["pending", "in_review", "resolved", "discarded"],
      invoice_invoice_type: ["customer_sales", "dealer_sales", "purchase"],
      invoice_payment_status: ["unpaid", "partial", "paid"],
      invoice_reconciliation_status: ["pending", "reconciled", "disputed", "override"],
      invoice_source_type: ["ubs_local", "dms_snapshot", "legacy_backfill"],
      job_title_level: ["junior", "mid", "senior", "lead", "executive"],
      journal_entry_source_type: ["ar_payment", "ap_payment", "manual", "adjustment"],
      lead_followup_outcome: ["contacted", "no_answer", "callback_scheduled", "not_interested", "qualified", "converted", "lost"],
      lead_followup_source_kind: ["lead", "prospect"],
      leave_quota_rule_period_type: ["daily", "weekly", "monthly", "date_range"],
      leave_request_day_part: ["full_day", "half_day_morning", "half_day_afternoon"],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      legacy_staging_record_record_type: ["purchase_invoice", "dealer_invoice", "staff", "branch", "advisor", "bank", "supplier", "dealer", "model", "color", "finance_company", "payment_type"],
      loan_application_status: ["pending", "approved", "rejected", "disbursed"],
      normalizer_column_authority_authority: ["dms", "legacy_fookloi", "ubs_local", "ubs_plus_dms"],
      normalizer_column_authority_overwrite_rule: ["always", "if_null", "if_null_or_older", "never", "conflict_review"],
      notification_type: ["info", "warning", "success", "error"],
      payment_event_event_type: ["payment", "reversal", "write_off", "adjustment"],
      payroll_run_status: ["draft", "finalised", "paid"],
      portal_announcement_announcement_type: ["general", "process_update", "reminder", "policy_note", "maintenance", "deadline"],
      portal_announcement_audience_scope: ["all", "admin_approver", "requester_staff"],
      portal_announcement_priority: ["low", "normal", "high", "urgent"],
      portal_announcement_status: ["draft", "published", "archived"],
      portal_document_category: ["form", "template", "sop", "guideline", "checklist", "policy", "general"],
      portal_document_status: ["active", "inactive", "archived"],
      portal_document_visibility_scope: ["all", "admin_approver", "requester_staff"],
      profile_role: ["super_admin", "company_admin", "director", "general_manager", "manager", "sales", "accounts", "analyst", "creator_updater", "portal_admin", "portal_manager", "portal_staff"],
      profile_status: ["active", "inactive", "resigned", "pending"],
      public_holiday_holiday_type: ["public", "company"],
      purchase_invoice_lifecycle_status: ["received", "verified", "approved", "scheduled", "paid", "cancelled"],
      purchase_invoice_payment_status: ["unpaid", "partial", "paid"],
      purchase_invoice_status: ["pending", "received", "cancelled"],
      purchase_order_lifecycle_status: ["draft", "submitted", "approved", "fulfilled", "closed", "cancelled"],
      push_token_platform: ["ios", "android", "web"],
      request_form_field_data_source: ["branches", "employees", "vehicles"],
      request_form_field_field_type: ["text", "textarea", "number", "date", "database_select", "select", "multiselect", "checkbox", "radio", "file"],
      request_module_setting_sla_start_event: ["submitted", "assigned"],
      request_saved_filter_scope: ["queue", "reports"],
      sales_activity_activity_type: ["call", "email", "meeting", "task", "note"],
      scheduled_report_date_range: ["last_7_days", "last_30_days", "last_month", "current_month"],
      scheduled_report_frequency: ["daily", "weekly", "monthly"],
      source_reconciliation_match_match_status: ["candidate", "auto_matched", "accepted", "conflict", "ignored", "rejected"],
      source_reconciliation_match_object_type: ["sales_order", "vehicle", "customer", "invoice_payment_evidence"],
      source_reconciliation_match_source_system: ["dms", "legacy_fookloi", "google_sheets", "ubs"],
      supplier_payment_event_event_type: ["payment", "reversal", "write_off", "adjustment"],
      sync_run_source_system: ["dms", "legacy_fookloi", "google_sheets", "manual"],
      sync_run_status: ["pending", "running", "succeeded", "failed", "cancelled"],
      ticket_activity_event_type: ["status_changed", "owner_changed", "resolution_note_updated", "priority_changed", "comment_added", "request_created", "category_changed", "subcategory_changed", "sla_paused", "sla_resumed", "sla_breached", "requester_update_submitted", "owner_requested_more_information", "owner_completed_request", "requester_closed_request", "attachment_added", "escalation_triggered", "admin_manual_override", "internal_note_added", "duplicate_linked", "request_reopened", "closure_feedback_submitted", "bulk_action_performed", "report_exported", "saved_filter_changed", "configuration_changed"],
      ticket_completion_category: ["resolved", "partially_resolved", "escalated", "transferred", "no_action_needed", "other", "rejected", "duplicate", "cancelled", "not_applicable"],
      ticket_priority: ["low", "medium", "high"],
      ticket_sla_status: ["on_track", "at_risk", "breached", "paused"],
      ticket_status: ["open", "in_progress", "pending_requester", "pending_owner_review", "completed_by_owner", "closed", "reopened", "cancelled"],
      vehicle_transfer_status: ["pending", "in_transit", "arrived", "cancelled"],
      vehicle_stage: ["pending_register_free_stock", "pending_deliver_loan_disburse", "complete"],
      vehicle_stage_override: ["pending_register_free_stock", "pending_deliver_loan_disburse", "complete"],
    },
  },
} as const
