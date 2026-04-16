/* eslint-disable @typescript-eslint/no-empty-object-type */
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
          updated_at: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string | null
          id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
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
      import_batches: {
        Row: {
          company_id: string | null
          created_at: string | null
          duplicate_rows: number | null
          error_rows: number | null
          file_name: string
          id: string
          published_at: string | null
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
          published_at?: string | null
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
          published_at?: string | null
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
          email: string | null
          ic_no: string | null
          id: string
          join_date: string | null
          name: string | null
          resign_date: string | null
          role: string | null
          staff_code: string | null
          status: string
          updated_at: string | null
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
          email?: string | null
          ic_no?: string | null
          id: string
          join_date?: string | null
          name?: string | null
          resign_date?: string | null
          role?: string | null
          staff_code?: string | null
          status?: string
          updated_at?: string | null
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
          email?: string | null
          ic_no?: string | null
          id?: string
          join_date?: string | null
          name?: string | null
          resign_date?: string | null
          role?: string | null
          staff_code?: string | null
          status?: string
          updated_at?: string | null
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
          salesman_name: string
          shipment_eta_kk_twu_sdk: string | null
          shipment_etd_pkg: string | null
          shipment_name: string | null
          source_row_id: string | null
          updated_at: string | null
          vaa_date: string | null
          variant: string | null
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
          salesman_name: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          updated_at?: string | null
          vaa_date?: string | null
          variant?: string | null
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
          salesman_name?: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          updated_at?: string | null
          vaa_date?: string | null
          variant?: string | null
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
