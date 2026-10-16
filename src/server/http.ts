import { NextResponse } from "next/server";

export function jsonError(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ error: { code, message, retryable } }, { status });
}

export function unexpectedError() {
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ event: "api.unexpected_error", requestId }));
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong. Try again.", requestId } }, { status: 500 });
}
