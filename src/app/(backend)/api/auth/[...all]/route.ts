import { toNextJsHandler } from 'better-auth/next-js';
import type { NextRequest } from 'next/server';

import { ensureAuthReady } from '@/auth';

// better-auth 实例初始化为 async(启动时需从 DB 读 admin 维护的微信/短信配置)。
// ensureAuthReady 返回当前实例(auth.ts 顶层 await 已保证首次就绪);
// admin 保存配置后 resetAuthInstance() 重建实例,本路由每次请求都取最新 handler。
const ensureAuthHandler = async () => {
  const instance = await ensureAuthReady();
  return toNextJsHandler(instance);
};

const jsonContentTypeRegex = /^application\/(?:[a-z-0-9.+-]*\+)?json/i;

const malformedJsonResponse = () =>
  Response.json({ code: 'INVALID_JSON', message: 'Malformed JSON request body' }, { status: 400 });

/**
 * better-call currently treats Request.json() SyntaxError as a server error.
 * Validate JSON bodies at the route boundary so malformed client payloads stay 400s.
 */
const validateJsonBody = async (request: Request) => {
  const contentType = request.headers.get('content-type') || '';
  if (!request.body || !jsonContentTypeRegex.test(contentType)) return;

  try {
    await request.clone().json();
  } catch (error) {
    if (error instanceof SyntaxError) return malformedJsonResponse();
    throw error;
  }
};

export const GET = async (request: NextRequest, ...rest: unknown[]) => {
  const current = await ensureAuthHandler();
  return current.GET(request, ...(rest as Parameters<typeof current.GET>));
};

export const POST = async (request: NextRequest) => {
  const invalidJsonResponse = await validateJsonBody(request);
  if (invalidJsonResponse) return invalidJsonResponse;

  const current = await ensureAuthHandler();
  return current.POST(request);
};
