// Async task hard deadline (image / video / file generation), 2s padding.
// Default bumped 5 min → 10 min: slow gateways plus large assets (multi-image
// batches, high-res renders) can exceed 5 min end-to-end even though every
// individual leg is healthy. Override per-deployment with ASYNC_TASK_TIMEOUT_MS.
export const ASYNC_TASK_TIMEOUT = Number(process.env.ASYNC_TASK_TIMEOUT_MS) || (60 * 10 - 2) * 1000;

// // trpc routes max duration
// export const TRPC_ASYNC_MAX_DURATION: number | undefined = undefined;
// export const TRPC_TOOLS_MAX_DURATION: number | undefined = undefined;

// export const WEBAPI_CHAT_MAX_DURATION: number = 300;
// export const WEBAPI_PLUGIN_GATEWAY_MAX_DURATION: number | undefined = undefined;
