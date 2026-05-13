import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketCheck, ClipboardList, ArrowRight } from 'lucide-react';
import { brandAssets, brandName } from '@/config/brand';
import { getDedicatedHrmsWorkspacePath, HRMS_PATHS } from '@/lib/hrmsWorkspace';

export default function LandingPage() {
  const hrmsLoginUrl = getDedicatedHrmsWorkspacePath(HRMS_PATHS.login);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={brandAssets.compactLogo} alt="Fook Loi Group" className="h-10 w-10 shrink-0 rounded-md object-contain" />
            <span className="truncate text-lg font-bold text-foreground">{brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/login">UBS</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={hrmsLoginUrl}>HRMS</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <img src={brandAssets.fullLogo} alt="Fook Loi Group" className="mb-8 h-auto max-h-28 w-full max-w-xl object-contain" />
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Welcome to {brandName}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Your unified business system for vehicle sales, inventory, and operations.
          Need something actioned internally? Access the Internal Requests portal to submit and track requests.
        </p>

        {/* Primary CTA */}
        <div className="mt-10">
          <Button asChild size="lg" className="gap-2 px-8 text-base h-12">
            <Link
              to="/login"
              state={{ from: { pathname: '/portal/tickets/new' } }}
            >
              Internal Requests Portal
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with your staff credentials to access the portal.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 max-w-2xl w-full">
          <Card className="text-left">
            <CardHeader className="pb-2">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <TicketCheck className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Create a Request</CardTitle>
              <CardDescription>
                Submit internal requests for operational support, technical issues, or service coordination.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="text-left">
            <CardHeader className="pb-2">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Track Your Requests</CardTitle>
              <CardDescription>
                View the status of every internal request you've submitted and follow up on open items.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} {brandName}. All rights reserved.
      </footer>
    </div>
  );
}
