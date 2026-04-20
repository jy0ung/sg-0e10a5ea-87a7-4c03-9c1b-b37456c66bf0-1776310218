import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const NAV_ITEMS = [
  { to: '/leave',      emoji: '🏖️',  label: 'Leave',       desc: 'Apply or view leave' },
  { to: '/attendance', emoji: '⏱️',  label: 'Attendance',  desc: 'Clock in / out' },
  { to: '/payslip',    emoji: '💵',  label: 'Payslips',    desc: 'View pay history' },
  { to: '/profile',    emoji: '👤',  label: 'Profile',     desc: 'My account' },
];

export default function DashboardScreen() {
  const { employee, user, signOut } = useAuth();
  usePushNotifications(); // initialise on first authenticated screen

  const displayName = employee?.name ?? user?.email ?? 'Employee';

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pb-4 pt-6">
        <div>
          <p className="text-xs text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
          {employee?.jobTitleName && (
            <p className="text-xs text-muted-foreground">{employee.jobTitleName}</p>
          )}
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground"
        >
          Sign out
        </button>
      </header>

      {/* Grid */}
      <main className="flex-1 px-5 pb-6">
        <div className="grid grid-cols-2 gap-4">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col gap-2 rounded-2xl bg-secondary p-5 transition-opacity active:opacity-70"
            >
              <span className="text-3xl">{item.emoji}</span>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
