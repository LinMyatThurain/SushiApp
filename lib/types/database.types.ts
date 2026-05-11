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
      daily_shipments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          shipment_date: string
          shipment_code: string
          status: "pending" | "confirmed"
          store_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          shipment_date: string
          shipment_code?: string
          status?: "pending" | "confirmed"
          store_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          shipment_date?: string
          shipment_code?: string
          status?: "pending" | "confirmed"
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_shipments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_shipments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["store_id"]
          },
        ]
      }
      end_of_day_items: {
        Row: {
          id: string
          product_id: string
          quantity_remaining: number
          quantity_sold: number
          quantity_returned: number
          submission_id: string
          return_reason: string | null
        }
        Insert: {
          id?: string
          product_id: string
          quantity_remaining?: number
          quantity_sold?: number
          quantity_returned?: number
          submission_id: string
          return_reason?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          quantity_remaining?: number
          quantity_sold?: number
          quantity_returned?: number
          submission_id?: string
          return_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "end_of_day_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sushi_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "end_of_day_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "end_of_day_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "end_of_day_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "end_of_day_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      end_of_day_submissions: {
        Row: {
          created_at: string
          id: string
          shipment_id: string | null
          status: "submitted"
          store_id: string
          submission_date: string
          submitted_by: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          shipment_id?: string | null
          status?: "submitted"
          store_id: string
          submission_date: string
          submitted_by: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          shipment_id?: string | null
          status?: "submitted"
          store_id?: string
          submission_date?: string
          submitted_by?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "end_of_day_submissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "end_of_day_submissions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "daily_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "end_of_day_submissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "end_of_day_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          signature_data: string | null
          signer_name: string | null
          shipment_id: string
          store_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          id?: string
          signature_data?: string | null
          signer_name?: string | null
          shipment_id: string
          store_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          signature_data?: string | null
          signer_name?: string | null
          shipment_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_confirmations_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "daily_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_confirmations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_confirmations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["store_id"]
          },
        ]
      }
      shipment_items: {
        Row: {
          id: string
          item_cost: number | null
          product_id: string
          quantity_sent: number
          shipment_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          item_cost?: number | null
          product_id: string
          quantity_sent: number
          shipment_id: string
          unit_price?: number
        }
        Update: {
          id?: string
          item_cost?: number | null
          product_id?: string
          quantity_sent?: number
          shipment_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sushi_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "daily_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          location: string | null
          manager_name: string | null
          name: string
          status: "active" | "inactive"
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          manager_name?: string | null
          name: string
          status?: "active" | "inactive"
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          manager_name?: string | null
          name?: string
          status?: "active" | "inactive"
          updated_at?: string | null
        }
        Relationships: []
      }
      sushi_products: {
        Row: {
          active_status: boolean
          category: string | null
          cost_price: number
          created_at: string
          id: string
          price: number | null
          product_name: string
          sku: string
          updated_at: string | null
        }
        Insert: {
          active_status?: boolean
          category?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          price?: number | null
          product_name: string
          sku: string
          updated_at?: string | null
        }
        Update: {
          active_status?: boolean
          category?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          price?: number | null
          product_name?: string
          sku?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role?: string
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          store_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_daily_sales"
            referencedColumns: ["store_id"]
          },
        ]
      }
    }
    Views: {
      v_daily_sales: {
        Row: {
          category: string | null
          cost_price: number | null
          net_profit: number | null
          price: number | null
          production_cost: number | null
          product_id: string | null
          product_name: string | null
          quantity_remaining: number | null
          quantity_sent: number | null
          quantity_sold: number | null
          quantity_returned: number | null
          revenue: number | null
          sku: string | null
          store_id: string | null
          store_location: string | null
          store_name: string | null
          submission_date: string | null
          submission_id: string | null
          submission_status: string | null
          return_reason: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: { Args: never; Returns: string }
      get_user_store_id: { Args: never; Returns: string }
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
