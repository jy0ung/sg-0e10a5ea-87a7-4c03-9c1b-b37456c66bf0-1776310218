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
      approval_decisions: {
        Row: {
          id: string
          instance_id: string
          step_id: string
          step_order: number
          approver_id: string
          decision: 'approved' | 'rejected'
          note: string | null
          decided_at: string
          created_at: string
        }
        Insert: {
          id?: string
          instance_id: string
          step_id: string
          step_order?: number
          approver_id: string
          decision: 'approved' | 'rejected'
          note?: string | null
          decided_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          instance_id?: string
          step_id?: string
          step_order?: number
          approver_id?: string
          decision?: 'approved' | 'rejected'
          note?: string | null
          decided_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "approval_instances"
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
            foreignKeyName: "approval_decisions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          }
        ]
      }
      approval_requests: {
        Row: {
          id: string
          company_id: string
          entity_type: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id: string
          flow_id: string
          requester_id: string
          current_step_order: number
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          entity_type: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id: string
          flow_id: string
          requester_id: string
          current_step_order?: number
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          entity_type?: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id?: string
          flow_id?: string
          requester_id?: string
          current_step_order?: number
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_flows: {
        Row: {
          id: string
          company_id: string
          name: string
          description: string | null
          entity_type: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          description?: string | null
          entity_type?: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          description?: string | null
          entity_type?: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_steps: {
        Row: {
          id: string
          flow_id: string
          step_order: number
          name: string
          approver_type: 'role' | 'specific_user' | 'direct_manager'
          approver_role: string | null
          approver_user_id: string | null
          allow_self_approval: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          flow_id: string
          step_order: number
          name: string
          approver_type: 'role' | 'specific_user' | 'direct_manager'
          approver_role?: string | null
          approver_user_id?: string | null
          allow_self_approval?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          flow_id?: string
          step_order?: number
          name?: string
          approver_type?: 'role' | 'specific_user' | 'direct_manager'
          approver_role?: string | null
          approver_user_id?: string | null
          allow_self_approval?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_flow_id_fkey"
            columns: ["flow_id"]
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          }
        ]
      }
      approval_instances: {
        Row: {
          id: string
          company_id: string
          flow_id: string
          entity_type: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id: string
          requester_id: string
          current_step_id: string | null
          current_step_order: number | null
          current_step_name: string | null
          current_approver_role: string | null
          current_approver_user_id: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          flow_id: string
          entity_type: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id: string
          requester_id: string
          current_step_id?: string | null
          current_step_order?: number | null
          current_step_name?: string | null
          current_approver_role?: string | null
          current_approver_user_id?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          flow_id?: string
          entity_type?: 'leave_request' | 'payroll_run' | 'appraisal' | 'general'
          entity_id?: string
          requester_id?: string
          current_step_id?: string | null
          current_step_order?: number | null
          current_step_name?: string | null
          current_approver_role?: string | null
          current_approver_user_id?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      branches: {
        Row: {
          code: string
          company_id: string
          created_at: string | null
          id: string
          name: string
          or_series: string | null
          vdo_series: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string | null
          id: string
          name: string
          or_series?: string | null
          vdo_series?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          or_series?: string | null
          vdo_series?: string | null
          updated_at?: string | null
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
      push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: 'ios' | 'android' | 'web'
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform: 'ios' | 'android' | 'web'
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          platform?: 'ios' | 'android' | 'web'
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: string
          read: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type?: string
          read?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          type?: string
          read?: boolean
          created_at?: string | null
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
          { foreignKeyName: "announcements_author_id_fkey"; columns: ["author_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      appraisal_items: {
        Row: {
          appraisal_id: string
          company_id: string | null
          areas_to_improve: string | null
          created_at: string
          employee_comments: string | null
          employee_id: string
          goals: string | null
          id: string
          achievements: string | null
          rating: number | null
          reviewed_at: string | null
          reviewer_comments: string | null
          reviewer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appraisal_id: string
          company_id?: string | null
          areas_to_improve?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id: string
          goals?: string | null
          id?: string
          achievements?: string | null
          rating?: number | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appraisal_id?: string
          company_id?: string | null
          areas_to_improve?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id?: string
          goals?: string | null
          id?: string
          achievements?: string | null
          rating?: number | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "appraisal_items_appraisal_id_fkey"; columns: ["appraisal_id"]; referencedRelation: "appraisals"; referencedColumns: ["id"] },
          { foreignKeyName: "appraisal_items_employee_id_fkey"; columns: ["employee_id"]; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "appraisal_items_reviewer_id_fkey"; columns: ["reviewer_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
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
          { foreignKeyName: "appraisals_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
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
          { foreignKeyName: "attendance_records_employee_id_fkey"; columns: ["employee_id"]; referencedRelation: "employees"; referencedColumns: ["id"] }
        ]
      }
      leave_balances: {
        Row: {
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
          { foreignKeyName: "leave_balances_employee_id_fkey"; columns: ["employee_id"]; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "leave_balances_leave_type_id_fkey"; columns: ["leave_type_id"]; referencedRelation: "leave_types"; referencedColumns: ["id"] }
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
          { foreignKeyName: "leave_requests_employee_id_fkey"; columns: ["employee_id"]; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "leave_requests_leave_type_id_fkey"; columns: ["leave_type_id"]; referencedRelation: "leave_types"; referencedColumns: ["id"] },
          { foreignKeyName: "leave_requests_reviewed_by_fkey"; columns: ["reviewed_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
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
      payroll_items: {
        Row: {
          allowances: number
          basic_salary: number
          created_at: string
          employee_id: string
          epf_employee: number
          epf_employer: number
          gross_pay: number
          id: string
          income_tax: number
          net_pay: number
          notes: string | null
          other_deductions: number
          overtime: number
          payroll_run_id: string
          socso_employee: number
          socso_employer: number
          total_deductions: number
          updated_at: string
        }
        Insert: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          employee_id: string
          epf_employee?: number
          epf_employer?: number
          id?: string
          income_tax?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_run_id: string
          socso_employee?: number
          socso_employer?: number
          updated_at?: string
        }
        Update: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          employee_id?: string
          epf_employee?: number
          epf_employer?: number
          id?: string
          income_tax?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_run_id?: string
          socso_employee?: number
          socso_employer?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "payroll_items_employee_id_fkey"; columns: ["employee_id"]; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "payroll_items_payroll_run_id_fkey"; columns: ["payroll_run_id"]; referencedRelation: "payroll_runs"; referencedColumns: ["id"] }
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
          { foreignKeyName: "payroll_runs_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
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
      import_batches: {
        Row: {
          company_id: string | null
          created_at: string | null
          duplicate_rows: number | null
          error_rows: number | null
          file_name: string
          id: string
          published_rows: number | null
          published_at: string | null
          review_completed_at: string | null
          review_rows: number | null
          status: string
          total_rows: number | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string
          valid_rows: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          error_rows?: number | null
          file_name: string
          id?: string
          published_rows?: number | null
          published_at?: string | null
          review_completed_at?: string | null
          review_rows?: number | null
          status?: string
          total_rows?: number | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by: string
          valid_rows?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          error_rows?: number | null
          file_name?: string
          id?: string
          published_rows?: number | null
          published_at?: string | null
          review_completed_at?: string | null
          review_rows?: number | null
          status?: string
          total_rows?: number | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string
          valid_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          review_reason: 'incomplete' | 'blocking' | 'mixed'
          review_status: 'pending' | 'in_review' | 'resolved' | 'discarded'
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
          review_reason: 'incomplete' | 'blocking' | 'mixed'
          review_status?: 'pending' | 'in_review' | 'resolved' | 'discarded'
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
          review_reason?: 'incomplete' | 'blocking' | 'mixed'
          review_status?: 'pending' | 'in_review' | 'resolved' | 'discarded'
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
      profiles: {
        Row: {
          access_scope: string | null
          avatar_url: string | null
          branch_id: string | null
          can_bulk_edit_vehicles: boolean | null
          can_edit_vehicles: boolean | null
          can_view_vehicle_details: boolean | null
          company_id: string | null
          contact_no: string | null
          created_at: string | null
          department_id: string | null
          employee_id: string | null
          email: string | null
          ic_no: string | null
          id: string
          job_title_id: string | null
          join_date: string | null
          manager_id: string | null
          name: string | null
          resign_date: string | null
          role: string | null
          staff_code: string | null
          status: string
          updated_at: string | null
          portal_access_only: boolean | null
        }
        Insert: {
          access_scope?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          can_bulk_edit_vehicles?: boolean | null
          can_edit_vehicles?: boolean | null
          can_view_vehicle_details?: boolean | null
          company_id?: string | null
          contact_no?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_id?: string | null
          email?: string | null
          ic_no?: string | null
          id: string
          job_title_id?: string | null
          join_date?: string | null
          manager_id?: string | null
          name?: string | null
          resign_date?: string | null
          role?: string | null
          staff_code?: string | null
          status?: string
          updated_at?: string | null
          portal_access_only?: boolean | null
        }
        Update: {
          access_scope?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          can_bulk_edit_vehicles?: boolean | null
          can_edit_vehicles?: boolean | null
          can_view_vehicle_details?: boolean | null
          company_id?: string | null
          contact_no?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_id?: string | null
          email?: string | null
          ic_no?: string | null
          id?: string
          job_title_id?: string | null
          join_date?: string | null
          manager_id?: string | null
          name?: string | null
          resign_date?: string | null
          role?: string | null
          staff_code?: string | null
          status?: string
          updated_at?: string | null
          portal_access_only?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          id: string
          company_id: string
          invoice_no: string
          supplier: string
          chassis_no: string
          model: string
          invoice_date: string
          amount: number
          status: string
          received_date: string | null
          remark: string | null
          created_at: string
          is_deleted: boolean | null
        }
        Insert: {
          id?: string
          company_id: string
          invoice_no: string
          supplier: string
          chassis_no: string
          model: string
          invoice_date: string
          amount: number
          status?: string
          received_date?: string | null
          remark?: string | null
          created_at?: string
          is_deleted?: boolean | null
        }
        Update: {
          id?: string
          company_id?: string
          invoice_no?: string
          supplier?: string
          chassis_no?: string
          model?: string
          invoice_date?: string
          amount?: number
          status?: string
          received_date?: string | null
          remark?: string | null
          created_at?: string
          is_deleted?: boolean | null
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
      vehicle_transfers: {
        Row: {
          id: string
          company_id: string
          running_no: string
          from_branch: string
          to_branch: string
          chassis_no: string
          model: string
          colour: string | null
          status: string
          remark: string | null
          arrived_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          running_no: string
          from_branch: string
          to_branch: string
          chassis_no: string
          model: string
          colour?: string | null
          status?: string
          remark?: string | null
          arrived_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          running_no?: string
          from_branch?: string
          to_branch?: string
          chassis_no?: string
          model?: string
          colour?: string | null
          status?: string
          remark?: string | null
          arrived_at?: string | null
          created_at?: string
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
      quality_issues: {
        Row: {
          chassis_no: string
          company_id: string | null
          created_at: string | null
          field: string
          id: string
          import_batch_id: string | null
          issue_type: string
          message: string
          severity: string
        }
        Insert: {
          chassis_no: string
          company_id?: string | null
          created_at?: string | null
          field: string
          id?: string
          import_batch_id?: string | null
          issue_type: string
          message: string
          severity?: string
        }
        Update: {
          chassis_no?: string
          company_id?: string | null
          created_at?: string | null
          field?: string
          id?: string
          import_batch_id?: string | null
          issue_type?: string
          message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_issues_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          kpi_id: string
          label: string
          sla_days: number
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          kpi_id: string
          label: string
          sla_days?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          kpi_id?: string
          label?: string
          sla_days?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          bg_date: string | null
          bg_to_delivery: number | null
          bg_to_disb: number | null
          bg_to_shipment_etd: number | null
          branch_code: string
          chassis_no: string
          company_id: string | null
          contra_sola: string | null
          created_at: string | null
          customer_name: string
          date_received_by_outlet: string | null
          dealer_transfer_price: string | null
          delivery_date: string | null
          delivery_to_disb: number | null
          disb_date: string | null
          etd_to_outlet: number | null
          full_payment_date: string | null
          full_payment_type: string | null
          id: string
          import_batch_id: string | null
          invoice_no: string | null
          is_d2d: boolean | null
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
          updated_at: string | null
          vaa_date: string | null
          variant: string | null
          plate_no: string | null
          is_deleted: boolean | null
          commission_paid: boolean | null
          commission_remark: string | null
          stage_override: string | null
          engine_no: string | null
          colour: string | null
          status: string | null
          branch_id: string | null
          owner_name: string | null
        }
        Insert: {
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code: string
          chassis_no: string
          company_id?: string | null
          contra_sola?: string | null
          created_at?: string | null
          customer_name: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean | null
          lou?: string | null
          model: string
          obr?: string | null
          outlet_to_reg?: number | null
          payment_method: string
          reg_date?: string | null
          reg_no?: string | null
          reg_to_delivery?: number | null
          remark?: string | null
          salesman_id?: string | null
          salesman_name: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          updated_at?: string | null
          vaa_date?: string | null
          variant?: string | null
          plate_no?: string | null
          is_deleted?: boolean | null
          commission_paid?: boolean | null
          commission_remark?: string | null
          stage_override?: string | null
          engine_no?: string | null
          colour?: string | null
          status?: string | null
          branch_id?: string | null
          owner_name?: string | null
        }
        Update: {
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          chassis_no?: string
          company_id?: string | null
          contra_sola?: string | null
          created_at?: string | null
          customer_name?: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean | null
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
          updated_at?: string | null
          vaa_date?: string | null
          variant?: string | null
          plate_no?: string | null
          is_deleted?: boolean | null
          commission_paid?: boolean | null
          commission_remark?: string | null
          stage_override?: string | null
          engine_no?: string | null
          colour?: string | null
          status?: string | null
          branch_id?: string | null
          owner_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_items: {
        Row: { id: string; company_id: string; item_code: string | null; description: string; unit_price: number; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; item_code?: string | null; description: string; unit_price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; item_code?: string | null; description?: string; unit_price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      commission_rules: {
        Row: { id: string; company_id: string; salesman_name: string | null; branch_code: string | null; rule_name: string; threshold_days: number | null; amount: number; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; salesman_name?: string | null; branch_code?: string | null; rule_name: string; threshold_days?: number | null; amount: number; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; salesman_name?: string | null; branch_code?: string | null; rule_name?: string; threshold_days?: number | null; amount?: number; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      commission_records: {
        Row: { id: string; company_id: string; vehicle_id: string | null; chassis_no: string; salesman_name: string; rule_id: string | null; status: string; amount: number; period: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; vehicle_id?: string | null; chassis_no: string; salesman_name: string; rule_id?: string | null; status?: string; amount: number; period: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; vehicle_id?: string | null; chassis_no?: string; salesman_name?: string; rule_id?: string | null; status?: string; amount?: number; period?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: [
          {
            foreignKeyName: "commission_records_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          }
        ]
      }
      customers: {
        Row: { id: string; company_id: string; name: string; email: string | null; phone: string | null; address: string | null; nric: string | null; ic_no: string | null; is_deleted: boolean | null; deleted_at: string | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; email?: string | null; phone?: string | null; address?: string | null; nric?: string | null; ic_no?: string | null; is_deleted?: boolean | null; deleted_at?: string | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; email?: string | null; phone?: string | null; address?: string | null; nric?: string | null; ic_no?: string | null; is_deleted?: boolean | null; deleted_at?: string | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      banks: {
        Row: { id: string; company_id: string; name: string; account_no: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; account_no?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; account_no?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      deal_stages: {
        Row: { id: string; company_id: string; name: string; stage_order: number; color: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; stage_order?: number; color?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; stage_order?: number; color?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      dealer_invoices: {
        Row: { id: string; company_id: string; invoice_no: string; branch: string | null; dealer_name: string | null; car_model: string | null; car_colour: string | null; chassis_no: string | null; sales_price: number | null; invoice_date: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; invoice_no: string; branch?: string | null; dealer_name?: string | null; car_model?: string | null; car_colour?: string | null; chassis_no?: string | null; sales_price?: number | null; invoice_date?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; invoice_no?: string; branch?: string | null; dealer_name?: string | null; car_model?: string | null; car_colour?: string | null; chassis_no?: string | null; sales_price?: number | null; invoice_date?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      dealers: {
        Row: { id: string; company_id: string; name: string; acc_code: string | null; company_reg_no: string | null; company_address: string | null; mailing_address: string | null; attn: string | null; contact_no: string | null; email: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; acc_code?: string | null; company_reg_no?: string | null; company_address?: string | null; mailing_address?: string | null; attn?: string | null; contact_no?: string | null; email?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; acc_code?: string | null; company_reg_no?: string | null; company_address?: string | null; mailing_address?: string | null; attn?: string | null; contact_no?: string | null; email?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      departments: {
        Row: { id: string; company_id: string; name: string; description: string | null; head_employee_id: string | null; cost_centre: string | null; is_active: boolean; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; description?: string | null; head_employee_id?: string | null; cost_centre?: string | null; is_active?: boolean; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; description?: string | null; head_employee_id?: string | null; cost_centre?: string | null; is_active?: boolean; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      finance_companies: {
        Row: { id: string; company_id: string; code: string; name: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; code: string; name: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; code?: string; name?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      handling_fees: {
        Row: { id: string; company_id: string; item_code: string | null; description: string; price: number; billing: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; item_code?: string | null; description: string; price?: number; billing?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; item_code?: string | null; description?: string; price?: number; billing?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      inspection_fees: {
        Row: { id: string; company_id: string; item_code: string | null; description: string; price: number; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; item_code?: string | null; description: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; item_code?: string | null; description?: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      insurance_companies: {
        Row: { id: string; company_id: string; code: string; name: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; code: string; name: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; code?: string; name?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      job_titles: {
        Row: { id: string; company_id: string; name: string; department_id: string | null; level: string | null; description: string | null; is_active: boolean; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; department_id?: string | null; level?: string | null; description?: string | null; is_active?: boolean; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; department_id?: string | null; level?: string | null; description?: string | null; is_active?: boolean; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      official_receipts: {
        Row: { id: string; company_id: string; receipt_no: string; receipt_date: string | null; branch: string | null; amount: number | null; attachment_url: string | null; verified_by: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; receipt_no: string; receipt_date?: string | null; branch?: string | null; amount?: number | null; attachment_url?: string | null; verified_by?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; receipt_no?: string; receipt_date?: string | null; branch?: string | null; amount?: number | null; attachment_url?: string | null; verified_by?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      payment_types: {
        Row: { id: string; company_id: string; name: string; billing: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; billing?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; billing?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      public_holidays: {
        Row: { id: string; company_id: string; name: string; date: string; holiday_type: string | null; is_recurring: boolean; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; date: string; holiday_type?: string | null; is_recurring?: boolean; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; date?: string; holiday_type?: string | null; is_recurring?: boolean; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      registration_fees: {
        Row: { id: string; company_id: string; description: string; price: number; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; description: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; description?: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      road_tax_fees: {
        Row: { id: string; company_id: string; description: string; price: number; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; description: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; description?: string; price?: number; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      suppliers: {
        Row: { id: string; company_id: string; name: string; code: string | null; company_reg_no: string | null; company_address: string | null; mailing_address: string | null; attn: string | null; contact_no: string | null; email: string | null; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; code?: string | null; company_reg_no?: string | null; company_address?: string | null; mailing_address?: string | null; attn?: string | null; contact_no?: string | null; email?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; code?: string | null; company_reg_no?: string | null; company_address?: string | null; mailing_address?: string | null; attn?: string | null; contact_no?: string | null; email?: string | null; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      tin_types: {
        Row: { id: string; company_id: string; code: string; name: string; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; code: string; name: string; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; code?: string; name?: string; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      user_groups: {
        Row: { id: string; company_id: string; name: string; status: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; name: string; status?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; name?: string; status?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      vehicle_colours: {
        Row: { id: string; company_id: string; code: string; name: string; hex: string | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; code: string; name: string; hex?: string | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; code?: string; name?: string; hex?: string | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      vehicle_models: {
        Row: { id: string; company_id: string; code: string; name: string; base_price: number | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; code: string; name: string; base_price?: number | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; code?: string; name?: string; base_price?: number | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      branch_mappings: {
        Row: { id: string; company_id: string; raw_value: string; canonical_code: string; notes: string | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; raw_value: string; canonical_code: string; notes?: string | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; raw_value?: string; canonical_code?: string; notes?: string | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      payment_method_mappings: {
        Row: { id: string; company_id: string; raw_value: string; canonical_value: string; notes: string | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; raw_value: string; canonical_value: string; notes?: string | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; raw_value?: string; canonical_value?: string; notes?: string | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      invoices: {
        Row: { id: string; company_id: string; invoice_no: string; sales_order_id: string | null; customer_id: string | null; customer_name: string | null; invoice_date: string | null; due_date: string | null; subtotal: number; tax_amount: number | null; discount_amount: number | null; total_amount: number; paid_amount: number | null; payment_status: string; notes: string | null; invoice_type: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; invoice_no: string; sales_order_id?: string | null; customer_id?: string | null; customer_name?: string | null; invoice_date?: string | null; due_date?: string | null; subtotal: number; tax_amount?: number | null; discount_amount?: number | null; total_amount: number; paid_amount?: number | null; payment_status?: string; notes?: string | null; invoice_type?: string; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; invoice_no?: string; sales_order_id?: string | null; customer_id?: string | null; customer_name?: string | null; invoice_date?: string | null; due_date?: string | null; subtotal?: number; tax_amount?: number | null; discount_amount?: number | null; total_amount?: number; paid_amount?: number | null; payment_status?: string; notes?: string | null; invoice_type?: string; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      sales_orders: {
        Row: { id: string; company_id: string; order_no: string; customer_id: string; customer_name: string | null; branch_code: string; salesman_id: string | null; salesman_name: string | null; model: string; variant: string | null; colour: string | null; booking_date: string; delivery_date: string | null; booking_amount: number | null; total_price: number | null; status: string; deal_stage_id: string | null; chassis_no: string | null; vehicle_id: string | null; notes: string | null; is_deleted: boolean; vso_no: string | null; deposit_amount: number | null; bank_loan_amount: number | null; outstanding_amount: number | null; finance_company: string | null; insurance_company: string | null; plate_no: string | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; order_no: string; customer_id: string; customer_name?: string | null; branch_code: string; salesman_id?: string | null; salesman_name?: string | null; model: string; variant?: string | null; colour?: string | null; booking_date: string; delivery_date?: string | null; booking_amount?: number | null; total_price?: number | null; status?: string; deal_stage_id?: string | null; chassis_no?: string | null; vehicle_id?: string | null; notes?: string | null; is_deleted?: boolean; vso_no?: string | null; deposit_amount?: number | null; bank_loan_amount?: number | null; outstanding_amount?: number | null; finance_company?: string | null; insurance_company?: string | null; plate_no?: string | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; order_no?: string; customer_id?: string; customer_name?: string | null; branch_code?: string; salesman_id?: string | null; salesman_name?: string | null; model?: string; variant?: string | null; colour?: string | null; booking_date?: string; delivery_date?: string | null; booking_amount?: number | null; total_price?: number | null; status?: string; deal_stage_id?: string | null; chassis_no?: string | null; vehicle_id?: string | null; notes?: string | null; is_deleted?: boolean; vso_no?: string | null; deposit_amount?: number | null; bank_loan_amount?: number | null; outstanding_amount?: number | null; finance_company?: string | null; insurance_company?: string | null; plate_no?: string | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      salesman_targets: {
        Row: { id: string; company_id: string; salesman_name: string; branch_code: string; period_year: number; period_month: number; target_units: number; target_revenue: number; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; company_id: string; salesman_name: string; branch_code: string; period_year: number; period_month: number; target_units?: number; target_revenue?: number; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; company_id?: string; salesman_name?: string; branch_code?: string; period_year?: number; period_month?: number; target_units?: number; target_revenue?: number; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      request_categories: {
        Row: { id: string; company_id: string; category_key: string; label: string; description: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string; updated_by: string | null }
        Insert: { id?: string; company_id: string; category_key: string; label: string; description?: string | null; is_active?: boolean; sort_order?: number; created_at?: string; updated_at?: string; updated_by?: string | null }
        Update: { id?: string; company_id?: string; category_key?: string; label?: string; description?: string | null; is_active?: boolean; sort_order?: number; created_at?: string; updated_at?: string; updated_by?: string | null }
        Relationships: []
      }
      request_attachment_settings: {
        Row: { id: string; company_id: string; max_file_size_mb: number; max_files_per_ticket: number; updated_by: string | null; updated_at: string | null; created_at: string | null }
        Insert: { id?: string; company_id: string; max_file_size_mb?: number; max_files_per_ticket?: number; updated_by?: string | null; updated_at?: string | null; created_at?: string | null }
        Update: { id?: string; company_id?: string; max_file_size_mb?: number; max_files_per_ticket?: number; updated_by?: string | null; updated_at?: string | null; created_at?: string | null }
        Relationships: []
      }
      ticket_attachments: {
        Row: { id: string; ticket_id: string; company_id: string; file_name: string; file_path: string; file_size: number; mime_type: string; uploaded_by: string; created_at: string | null }
        Insert: { id?: string; ticket_id: string; company_id: string; file_name: string; file_path: string; file_size: number; mime_type: string; uploaded_by: string; created_at?: string | null }
        Update: { id?: string; ticket_id?: string; company_id?: string; file_name?: string; file_path?: string; file_size?: number; mime_type?: string; uploaded_by?: string; created_at?: string | null }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_import_batch: {
        Args: { p_batch_id: string; p_vehicles: unknown; p_quality_issues: unknown; p_valid_rows: number; p_error_rows: number }
        Returns: unknown
      }
      search_vehicles: {
        Args: { p_branch?: string | null; p_model?: string | null; p_payment?: string | null; p_stage?: string | null; p_search?: string | null; p_company_id?: string | null; p_limit?: number | null; p_offset?: number | null }
        Returns: unknown
      }
      vehicle_kpi_summary: {
        Args: { p_company_id?: string | null; p_branch?: string | null; p_period_start?: string | null; p_period_end?: string | null }
        Returns: unknown
      }
      auto_aging_dashboard_summary: {
        Args: { p_company_id?: string | null; p_branch?: string | null; p_model?: string | null; p_from?: string | null; p_to?: string | null }
        Returns: unknown
      }
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
  public: {
    Enums: {},
  },
} as const
