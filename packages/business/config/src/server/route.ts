// Async task hard deadline (image / video / file generation), 2s padding.
// Default bumped 5 min → 10 min: slow gateways plus large assets (multi-image
// batches, high-res renders) can exceed 5 min end-to-end even though every
// individual leg is healthy. Override per-deployment with ASYNC_TASK_TIMEOUT_MS.
export const ASYNC_TASK_TIMEOUT = Number(process.env.ASYNC_TASK_TIMEOUT_MS) || (60 * 10 - 2) * 1000;

// Video tasks legitimately run longer than image/file tasks (e.g. minimax-h3
// 768p ≈ 11 min end-to-end), and nothing refreshes the task row while the
// gateway pollers wait — a 10-min window killed in-flight videos that the
// gateway was still rendering. Keep this in sync with the pollers' internal
// 30-min limit (180 attempts × 10 s). Override with ASYNC_TASK_VIDEO_TIMEOUT_MS.
export const ASYNC_TASK_VIDEO_TIMEOUT =
  Number(process.env.ASYNC_TASK_VIDEO_TIMEOUT_MS) || (60 * 30 - 2) * 1000;

// // trpc routes max duration
// export const TRPC_ASYNC_MAX_DURATION: number | undefined = undefined;
// export const TRPC_TOOLS_MAX_DURATION: number | undefined = undefined;

// export const WEBAPI_CHAT_MAX_DURATION: number = 300;
// export const WEBAPI_PLUGIN_GATEWAY_MAX_DURATION: number | undefined = undefined;
