WARN: environment variable is unset: AUTH_SMTP_PASS
Connecting to db 5432
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
          category: string
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          pinned: boolean
          priority: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          category?: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
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
          status: string
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
          status?: string
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
          status?: string
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
          cycle: string
          id: string
          period_end: string
          period_start: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          cycle?: string
          id?: string
          period_end: string
          period_start: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          cycle?: string
          id?: string
          period_end?: string
          period_start?: string
          status?: string
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
          approval_request_id: string
          approver_id: string
          created_at: string
          decided_at: string
          decision: string
          id: string
          instance_id: string | null
          note: string | null
          step_id: string
          step_order: number | null
        }
        Insert: {
          approval_request_id: string
          approver_id: string
          created_at?: string
          decided_at?: string
          decision: string
          id?: string
          instance_id?: string | null
          note?: string | null
          step_id: string
          step_order?: number | null
        }
        Update: {
          approval_request_id?: string
          approver_id?: string
          created_at?: string
          decided_at?: string
          decision?: string
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
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_flows_created_by_fkey"
            columns: ["created_by"]
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
          entity_type: string
          flow_id: string
          id: string
          requester_id: string
          status: string
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
          entity_type: string
          flow_id: string
          id?: string
          requester_id: string
          status?: string
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
          entity_type?: string
          flow_id?: string
          id?: string
          requester_id?: string
          status?: string
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
          entity_type: string
          flow_id: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_step_order?: number
          entity_id: string
          entity_type: string
          flow_id: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_step_order?: number
          entity_id?: string
          entity_type?: string
          flow_id?: string
          id?: string
          requester_id?: string
          status?: string
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
          approver_type: string
          approver_user_id: string | null
          created_at: string
          flow_id: string
          id: string
          name: string
          step_order: number
          updated_at: string
        }
        Insert: {
          allow_self_approval?: boolean
          approver_role?: string | null
          approver_type: string
          approver_user_id?: string | null
          created_at?: string
          flow_id: string
          id?: string
          name: string
          step_order: number
          updated_at?: string
        }
        Update: {
          allow_self_approval?: boolean
          approver_role?: string | null
          approver_type?: string
          approver_user_id?: string | null
          created_at?: string
          flow_id?: string
          id?: string
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
          status: string
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
          status?: string
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
          status?: string
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
          permission_level: string
          table_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          column_name: string
          created_at?: string | null
          id?: string
          permission_level: string
          table_name?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          column_name?: string
          created_at?: string | null
          id?: string
          permission_level?: string
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
          status: string
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
          status?: string
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
          status?: string
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
          source: string
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
          source?: string
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
          source?: string
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
          primary_role: string
          resign_date: string | null
          staff_code: string | null
          status: string
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
          primary_role?: string
          resign_date?: string | null
          staff_code?: string | null
          status?: string
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
          primary_role?: string
          resign_date?: string | null
          staff_code?: string | null
          status?: string
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
          review_reason: string
          review_status: string
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
          review_reason: string
          review_status?: string
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
          review_reason?: string
          review_status?: string
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
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          invoice_type: string
          notes: string | null
          paid_amount: number
          payment_status: string
          sales_order_id: string
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
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_no: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          sales_order_id: string
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
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          sales_order_id?: string
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
          level: string | null
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
          level?: string | null
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
          level?: string | null
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
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
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
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
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
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
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
          status?: string
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
          name: string
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
          name: string
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
          name?: string
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
          record_type: string
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
          record_type: string
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
          record_type?: string
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
          authority: string
          canonical_table: string
          column_name: string
          created_at: string
          id: string
          notes: string | null
          overwrite_rule: string
        }
        Insert: {
          authority: string
          canonical_table: string
          column_name: string
          created_at?: string
          id?: string
          notes?: string | null
          overwrite_rule: string
        }
        Update: {
          authority?: string
          canonical_table?: string
          column_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          overwrite_rule?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
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
          status: string
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
          status?: string
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
          status?: string
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
          role: string
          staff_code: string | null
          status: string
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
          role?: string
          staff_code?: string | null
          status?: string
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
          role?: string
          staff_code?: string | null
          status?: string
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
          holiday_type: string
          id: string
          is_recurring: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          holiday_type?: string
          id?: string
          is_recurring?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          holiday_type?: string
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
          chassis_no: string
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          invoice_date: string
          invoice_no: string
          is_deleted: boolean
          model: string
          received_date: string | null
          remark: string | null
          status: string
          supplier: string
        }
        Insert: {
          amount: number
          chassis_no: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_date: string
          invoice_no: string
          is_deleted?: boolean
          model: string
          received_date?: string | null
          remark?: string | null
          status?: string
          supplier: string
        }
        Update: {
          amount?: number
          chassis_no?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          is_deleted?: boolean
          model?: string
          received_date?: string | null
          remark?: string | null
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          platform?: string
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
          created_at: string
          created_by: string | null
          data_source: string | null
          field_key: string
          field_type: string
          help_text: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          placeholder: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_key: string
          company_id: string
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          field_key: string
          field_type?: string
          help_text?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          placeholder?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_key?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          field_key?: string
          field_type?: string
          help_text?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          placeholder?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_form_fields_category_fkey"
            columns: ["company_id", "category_key"]
            isOneToOne: false
            referencedRelation: "request_categories"
            referencedColumns: ["company_id", "category_key"]
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
      request_subcategories: {
        Row: {
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
      sales_orders: {
        Row: {
          bank_loan_amount: number | null
          booking_amount: number | null
          booking_date: string
          branch_code: string
          chassis_no: string | null
          color: string | null
          company_id: string
          created_at: string
          customer_id: string | null
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
          id: string
          insurance_company: string | null
          is_deleted: boolean
          model: string
          notes: string | null
          order_no: string | null
          outstanding_amount: number | null
          payment_method: string | null
          plate_no: string | null
          salesman_name: string
          selling_price: number | null
          stage_id: string | null
          updated_at: string
          variant: string | null
          vehicle_id: string | null
          vso_no: string | null
        }
        Insert: {
          bank_loan_amount?: number | null
          booking_amount?: number | null
          booking_date: string
          branch_code: string
          chassis_no?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          customer_id?: string | null
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
          id?: string
          insurance_company?: string | null
          is_deleted?: boolean
          model: string
          notes?: string | null
          order_no?: string | null
          outstanding_amount?: number | null
          payment_method?: string | null
          plate_no?: string | null
          salesman_name: string
          selling_price?: number | null
          stage_id?: string | null
          updated_at?: string
          variant?: string | null
          vehicle_id?: string | null
          vso_no?: string | null
        }
        Update: {
          bank_loan_amount?: number | null
          booking_amount?: number | null
          booking_date?: string
          branch_code?: string
          chassis_no?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
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
          id?: string
          insurance_company?: string | null
          is_deleted?: boolean
          model?: string
          notes?: string | null
          order_no?: string | null
          outstanding_amount?: number | null
          payment_method?: string | null
          plate_no?: string | null
          salesman_name?: string
          selling_price?: number | null
          stage_id?: string | null
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
          match_status: string
          object_type: string
          review_notes: string | null
          review_owner: string | null
          reviewed_at: string | null
          source_priority: number
          source_record_id: string
          source_system: string
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
          match_status?: string
          object_type: string
          review_notes?: string | null
          review_owner?: string | null
          reviewed_at?: string | null
          source_priority?: number
          source_record_id: string
          source_system: string
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
          match_status?: string
          object_type?: string
          review_notes?: string | null
          review_owner?: string | null
          reviewed_at?: string | null
          source_priority?: number
          source_record_id?: string
          source_system?: string
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
          source_system: string
          started_at: string
          status: string
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
          source_system: string
          started_at?: string
          status?: string
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
          source_system?: string
          started_at?: string
          status?: string
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
          event_type: string
          id: string
          message: string
          metadata: Json
          ticket_id: string
        }
        Insert: {
          actor_id: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json
          ticket_id: string
        }
        Update: {
          actor_id?: string
          company_id?: string
          created_at?: string
          event_type?: string
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
      tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          business_impact: string | null
          category: string
          company_id: string
          created_at: string
          custom_fields: Json
          description: string
          desired_outcome: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          priority: string
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
          subcategory: string | null
          subject: string
          submitted_by: string
          updated_at: string
          vso_number: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          business_impact?: string | null
          category?: string
          company_id: string
          created_at?: string
          custom_fields?: Json
          description: string
          desired_outcome?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          priority?: string
          requested_due_date?: string | null
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          subcategory?: string | null
          subject: string
          submitted_by: string
          updated_at?: string
          vso_number?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          business_impact?: string | null
          category?: string
          company_id?: string
          created_at?: string
          custom_fields?: Json
          description?: string
          desired_outcome?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          priority?: string
          requested_due_date?: string | null
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
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
          status: string
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
          status?: string
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
          status?: string
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
          chassis_no: string
          color: string | null
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
          etd_to_outlet: number | null
          full_payment_date: string | null
          full_payment_type: string | null
          id: string
          import_batch_id: string | null
          invoice_no: string | null
          is_d2d: boolean
          is_deleted: boolean
          lou: string | null
          model: string
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
          stage: string | null
          stage_override: string | null
          updated_at: string
          vaa_date: string | null
          variant: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          chassis_no: string
          color?: string | null
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
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          is_deleted?: boolean
          lou?: string | null
          model?: string
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
          stage?: string | null
          stage_override?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          chassis_no?: string
          color?: string | null
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
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          is_deleted?: boolean
          lou?: string | null
          model?: string
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
          stage?: string | null
          stage_override?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
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
        Args: { p_cancellation_note?: string; p_ticket_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          business_impact: string | null
          category: string
          company_id: string
          created_at: string
          custom_fields: Json
          description: string
          desired_outcome: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          priority: string
          requested_due_date: string | null
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
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
      current_access_scope: { Args: never; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      get_my_access_scope: {
        Args: never
        Returns: {
          user_access_scope: string
          user_branch_id: string
          user_company_id: string
          user_role: string
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
      normalize_dms_customer: { Args: { p_raw_id: string }; Returns: Json }
      normalize_dms_sales_order: { Args: { p_raw_id: string }; Returns: Json }
      normalize_dms_vehicle_stock: {
        Args: { p_delivery_id?: string; p_raw_id: string }
        Returns: Json
      }
      search_vehicles: {
        Args: {
          p_bg_date_from?: string
          p_bg_date_to?: string
          p_branch?: string
          p_has_delivery_date?: boolean
          p_limit?: number
          p_model?: string
          p_offset?: number
          p_payment?: string
          p_search?: string
          p_sort_column?: string
          p_sort_direction?: string
          p_stage?: string
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
      unlink_vehicle_from_sales_order: {
        Args: { p_sales_order_id: string }
        Returns: Json
      }
      vehicle_kpi_summary: { Args: { p_branch?: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

