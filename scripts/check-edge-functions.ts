#!/usr/bin/env -S npx tsx
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const functionsDir = join(root, 'supabase', 'functions');
const sharedDir = join(functionsDir, '_shared');

type Finding = {
  file: string;
  message: string;
};

const findings: Finding[] = [];

function addFinding(filePath: string, message: string) {
  findings.push({ file: relative(root, filePath), message });
}

function getFunctionEntryFiles(): string[] {
  return readdirSync(functionsDir)
    .map((name) => join(functionsDir, name))
    .filter((path) => statSync(path).isDirectory() && path !== sharedDir)
    .map((path) => join(path, 'index.ts'));
}

for (const filePath of getFunctionEntryFiles()) {
  const source = readFileSync(filePath, 'utf8');
  const serveCount = [...source.matchAll(/\bDeno\.serve\s*\(/g)].length;

  if (serveCount !== 1) {
    addFinding(filePath, `expected exactly one Deno.serve handler, found ${serveCount}`);
  }

  if (!source.includes("import { buildCorsHeaders } from '../_shared/cors.ts'")) {
    addFinding(filePath, 'must import buildCorsHeaders from the shared CORS helper');
  }

  if (!source.includes('buildCorsHeaders(req)')) {
    addFinding(filePath, 'must call buildCorsHeaders(req) instead of static or wildcard CORS headers');
  }

  if (/Access-Control-Allow-Origin['"]\s*:\s*['"]\*/.test(source)) {
    addFinding(filePath, 'must not use wildcard Access-Control-Allow-Origin');
  }

  if (!source.includes("req.headers.get('Authorization')") && !source.includes('req.headers.get("Authorization")')) {
    addFinding(filePath, 'must read the Authorization header');
  }

  if (!source.includes('.auth.getUser()')) {
    addFinding(filePath, 'must verify end-user JWTs with auth.getUser() before using service-role data access');
  }

  const usesServiceRole = source.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')") || source.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
  if (usesServiceRole) {
    const hasRoleGate = /\b(role|access_scope)\b/.test(source);
    const hasCompanyGate = /\bcompany_id\b/.test(source);
    if (!hasRoleGate) {
      addFinding(filePath, 'service-role function must check caller role or access_scope');
    }
    if (!hasCompanyGate) {
      addFinding(filePath, 'service-role function must enforce or document company_id scope');
    }
  }
}

if (findings.length > 0) {
  console.error('Edge function security check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.message}`);
  }
  process.exit(1);
}

console.info('Edge function security check passed.');
