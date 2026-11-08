import debug from 'debug';

import { FileModel } from '@/database/models/file';
import { getServerDB } from '@/database/server';
import { FileService } from '@/server/services/file';

const log = debug('lobe-file:proxy');

type Params = Promise<{ id: string }>;

/**
 * File proxy service
 * GET /f/:id
 *
 * Features:
 * - Query database to get file record (without userId filter for public access)
 * - Generate a temporary S3 presigned preview URL
 * - Return 302 redirect
 *
 * NOTE: This endpoint is intentionally unauthenticated. The proxy URL is
 * embedded in bare `<img>` tags, download links, and links shared to AI — none
 * of which can attach auth headers/cookies. Adding `checkAuth` here would break
 * every previously-shared `/f/:id` link, so access stays public by id.
 */
export const GET = async (_req: Request, segmentData: { params: Params }) => {
  try {
    const params = await segmentData.params;
    const { id } = params;

    log('File proxy request: %s', id);

    // Get database connection
    const db = await getServerDB();

    // Query file record without userId filter (public access)
    const file = await FileModel.getFileById(db, id);

    if (!file) {
      log('File not found: %s', id);
      return new Response('File not found', {
        status: 404,
      });
    }

    // Create file service with file owner's userId
    const fileService = new FileService(db, file.userId);

    // 视频/音频:直接流式代理而不是 302 跳 presigned URL。
    // 原因:浏览器 <video> 预览会先发 HEAD/Range 请求,部分 S3 兼容存储
    // (如 RustFS)对 HEAD 签名校验失败返回 403;且 302 跳到存储域名是跨域
    // 响应,在 Strict-Origin 策略下会丢 Referer。流式代理同源返回,支持
    // Range 分段,视频可拖动进度条。
    if (file.fileType?.startsWith('video/') || file.fileType?.startsWith('audio/')) {
      // HEAD 请求:返回与 GET 相同的头(不含 body),预览组件探测元数据用
      if (_req.method === 'HEAD') {
        const meta = await fileService.getFileMetadataSafe(file.url);
        return new Response(null, {
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(meta.contentLength ?? 0),
            'Content-Type': file.fileType,
          },
        });
      }

      const range = _req.headers.get('range');
      const upstream = await fileService.getFileStream(file.url);

      if (!upstream) {
        return new Response('File content not found', { status: 404 });
      }

      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
        'Content-Type': file.fileType,
      });
      if (upstream.contentLength) {
        headers.set('Content-Length', String(upstream.contentLength));
      }
      if (upstream.contentRange) {
        headers.set('Content-Range', upstream.contentRange);
      }

      return new Response(upstream.body as ReadableStream, {
        headers,
        status: upstream.contentRange ? 206 : 200,
      });
    }

    // Web: Generate a cached S3 presigned URL, normalizing legacy full S3 URLs.
    const redirectUrl = await fileService.createCachedPreSignedUrlForPreview(file.url);
    log('Web S3 presigned URL generated');

    // Return 302 redirect
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error('File proxy error:', error);
    return new Response('Internal server error', {
      status: 500,
    });
  }
};
