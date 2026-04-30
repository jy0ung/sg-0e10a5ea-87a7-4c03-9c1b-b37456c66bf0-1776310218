import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HeadphonesIcon, TicketCheck, ClipboardList, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-base">F</span>
            </div>
            <span className="text-lg font-bold text-foreground">Fook Loi Group UBS</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Staff Sign In</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <HeadphonesIcon className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Welcome to Fook Loi Group UBS
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
        &copy; {new Date().getFullYear()} Fook Loi Group UBS. All rights reserved.
      </footer>
    </div>
  );
}
