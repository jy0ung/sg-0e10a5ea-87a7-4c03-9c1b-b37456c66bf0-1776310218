import { supabase } from "@/integrations/supabase/client";

export default async function handler(req: any, res: any) {
  try {
    // Check database connectivity
    const { data, error } = await supabase.from("companies").select("count").single();
    
    if (error) {
      throw error;
    }

    res.status(200).json({ 
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      version: import.meta.env.VITE_APP_VERSION || "1.0.0"
    });
  } catch (error) {
    res.status(503).json({ 
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error.message
    });
  }
}