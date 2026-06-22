import { useState, useEffect } from 'react';
import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  isPushSupported,
  getPermissionStatus,
  subscribe,
  unsubscribe,
  isSubscribed,
  sendTestNotification,
} from '@/services/pushNotificationService';

export function NotificationSettings() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    isSubscribed().then((sub) => {
      setSubscribed(sub);
      setLoading(false);
    });
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (!user) return;
    setToggling(true);
    try {
      if (enabled) {
        const { error } = await subscribe(user.id, user.company_id || '');
        if (error) {
          toast.error(error.message);
          return;
        }
        setSubscribed(true);
        toast.success('Push notifications enabled');
        // Send test notification
        setTimeout(() => sendTestNotification(), 1000);
      } else {
        const { error } = await unsubscribe(user.id);
        if (error) {
          toast.error(error.message);
          return;
        }
        setSubscribed(false);
        toast.success('Push notifications disabled');
      }
    } catch {
      toast.error('Failed to update notification settings');
    } finally {
      setToggling(false);
    }
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellOff className="h-4 w-4" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Push notifications are not supported in this browser.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const permission = getPermissionStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified about deal stage changes, SLA warnings, and important updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {permission === 'denied' && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            Notifications are blocked by your browser. Please enable them in your browser settings.
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Enable push notifications</p>
            <p className="text-xs text-muted-foreground">
              {subscribed ? 'You will receive push notifications' : 'Receive alerts even when the app is in the background'}
            </p>
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Switch
              checked={subscribed}
              onCheckedChange={handleToggle}
              disabled={toggling || permission === 'denied'}
            />
          )}
        </div>

        {subscribed && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500" />
            Push notifications are active
          </div>
        )}

        {subscribed && (
          <Button variant="outline" size="sm" onClick={() => sendTestNotification()}>
            Send test notification
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
