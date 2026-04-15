import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Home } from "lucide-react";

export function ErrorPage({ 
  title = "Page Not Found", 
  description = "The page you're looking for doesn't exist or has been moved." 
}: { 
  title?: string;
  description?: string;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${title} - FLCBI`;
  }, [title]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={() => navigate("/")} className="w-full" size="lg">
            <Home className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}