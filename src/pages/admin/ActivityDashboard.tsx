import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  Users, 
  Car, 
  TrendingUp, 
  RefreshCw, 
  Download, 
  Calendar,
  Filter,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { getAllAuditLogs, AuditLogWithProfile } from '@/services/auditService';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Chart,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = {
  create: '#22c55e',
  update: '#f59e0b',
  delete: '#ef4444',
  permission_change: '#3b82f6',
  other: '#8b5cf6'
};

export default function ActivityDashboard() {
  const [logs, setLogs] = useState<AuditLogWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, [timeRange, actionFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const fromDate = getFromDate(timeRange);
      const result = await getAllAuditLogs(200, 0, {
        fromDate,
        entityType: actionFilter === 'all' ? undefined : actionFilter,
      });
      if (result.data) {
        setLogs(result.data);
      }
    } catch (error) {
      console.error('Error loading activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFromDate = (range: 'today' | 'week' | 'month'): Date => {
    const now = new Date();
    switch (range) {
      case 'today':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(now.setHours(0, 0, 0, 0));
    }
  };

  const calculateStats = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = logs.filter(log => new Date(log.created_at) >= today);
    const uniqueUsers = new Set(todayLogs.map(log => log.user_id)).size;
    const vehicleEdits = todayLogs.filter(log => log.entity_type === 'vehicle').length;

    return {
      totalActions: todayLogs.length,
      activeUsers: uniqueUsers,
      vehicleEdits,
    };
  };

  const getActionDistribution = () => {
    const distribution = logs.reduce((acc, log) => {
      const action = log.action;
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(distribution).map(([name, value]) => ({
      name,
      value,
      color: COLORS[name as keyof typeof COLORS] || COLORS.other,
    }));
  };

  const getActivityByHour = () => {
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: 0,
    }));

    logs.forEach(log => {
      const hour = new Date(log.created_at).getHours();
      hourlyData[hour].count++;
    });

    return hourlyData;
  };

  const getUserActivityLeaderboard = () => {
    const userActivity = logs.reduce((acc, log) => {
      const userId = log.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          userId,
          name: log.profiles?.full_name || 'Unknown',
          email: log.profiles?.email || '',
          count: 0,
        };
      }
      acc[userId].count++;
      return acc;
    }, {} as Record<string, { userId: string; name: string; email: string; count: number }>);

    return Object.values(userActivity)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const getRecentActions = () => {
    return logs.slice(0, 20);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create':
        return <Activity className="h-4 w-4 text-success" />;
      case 'update':
        return <RefreshCw className="h-4 w-4 text-warning" />;
      case 'delete':
        return <TrendingUp className="h-4 w-4 text-destructive" />;
      case 'permission_change':
        return <Users className="h-4 w-4 text-primary" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const stats = calculateStats();
  const actionDistribution = getActionDistribution();
  const hourlyActivity = getActivityByHour();
  const leaderboard = getUserActivityLeaderboard();
  const recentActions = getRecentActions();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Activity Dashboard</h1>
          <p className="text-muted-foreground">Track user actions and inventory changes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            {(['today', 'week', 'month'] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="rounded-none first:rounded-l-md last:rounded-r-md"
              >
                {range === 'today' ? 'Today' : range === 'week' ? 'Week' : 'Month'}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={loadLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Actions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalActions}</div>
            <p className="text-xs text-muted-foreground">
              {timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This week' : 'This month'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">Users performed actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vehicle Edits</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.vehicleEdits}</div>
            <p className="text-xs text-muted-foreground">Inventory changes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Actions/User</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.activeUsers > 0 ? (stats.totalActions / stats.activeUsers).toFixed(1) : '0'}
            </div>
            <p className="text-xs text-muted-foreground">Actions per active user</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Action Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Action Distribution</CardTitle>
            <CardDescription>Breakdown of action types</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px]">
              <PieChart>
                <Pie
                  data={actionDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {actionDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {actionDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="capitalize">{item.name}</span>
                  <Badge variant="secondary" className="ml-auto">{item.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity Trend */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Activity Trend</CardTitle>
            <CardDescription>Actions by hour of day</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px]">
              <LineChart data={hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="hour" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}:00`}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard and Recent Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* User Activity Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>User Activity Leaderboard</CardTitle>
            <CardDescription>Most active users</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {leaderboard.map((user, index) => (
                  <div 
                    key={user.userId}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-gray-100 text-gray-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-muted text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                    <Badge variant="secondary">{user.count} actions</Badge>
                  </div>
                ))}
                {leaderboard.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No activity recorded
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Actions</CardTitle>
            <CardDescription>Latest system activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {recentActions.map((log) => (
                  <div 
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="mt-1">{getActionIcon(log.action)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{log.action}</span>
                        <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">{log.profiles?.full_name || 'Unknown'}</span>
                        {' '}• {formatDate(log.created_at)} {formatTime(log.created_at)}
                      </div>
                      {log.changes && Object.keys(log.changes).length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {Object.keys(log.changes).length} field(s) changed
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                  </div>
                ))}
                {recentActions.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No recent activity
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}