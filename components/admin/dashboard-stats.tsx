import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export async function DashboardStats() {
  const supabase = await createClient()

  // Fetch stats from database
  const [storesResult, productsResult, shipmentsResult] = await Promise.all([
    supabase.from('stores').select('id', { count: 'exact', head: true }),
    supabase.from('sushi_products').select('id', { count: 'exact', head: true }),
    supabase.from('daily_shipments').select('id', { count: 'exact', head: true })
  ])

  const stats = {
    totalStores: storesResult.count || 0,
    totalProducts: productsResult.count || 0,
    totalShipments: shipmentsResult.count || 0,
    pendingShipments: 0 // We'll add this when we have status tracking
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalStores}</div>
          <p className="text-xs text-muted-foreground">
            Active store locations
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalProducts}</div>
          <p className="text-xs text-muted-foreground">
            Sushi items available
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Shipments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalShipments}</div>
          <p className="text-xs text-muted-foreground">
            All time deliveries
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Shipments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.pendingShipments}</div>
          <p className="text-xs text-muted-foreground">
            Awaiting delivery
          </p>
        </CardContent>
      </Card>
    </div>
  )
}