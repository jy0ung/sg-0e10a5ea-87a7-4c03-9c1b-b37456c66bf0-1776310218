import { supabase } from "@/integrations/supabase/client";

export default async function handler(req: { method?: string }, res: {
  status: (code: number) => { json: (data: unknown) => void };
}) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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
      error: error instanceof Error ? error.message : String(error)
    });
  }
}