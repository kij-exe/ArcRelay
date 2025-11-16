"use server";

import { NextResponse } from "next/server";

function getBackendOAuthBase(): string {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_OAUTH_BASE ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3000";
  return base.replace(/\/api$/, "");
}

export async function GET() {
  const backend = getBackendOAuthBase();
  const target = `${backend}/auth/google`;
  return NextResponse.redirect(target, { status: 307 });
}


