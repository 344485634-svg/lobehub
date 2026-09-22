'use client';

import { type FC, useEffect, useState } from 'react';

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const renderInline = (s: string) =>
  s
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    .replaceAll(/`(.+?)`/g, '<code>$1</code>')
    .replaceAll(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

/**
 * Minimal line-based markdown → HTML renderer for admin-authored legal copy.
 * Escapes HTML first, then supports headings, hr, blockquotes, ordered /
 * unordered lists, inline emphasis / code / links, and paragraphs.
 */
const renderMarkdown = (md: string): string => {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let list: 'ol' | 'ul' | null = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }

    const headingMark = line.match(/^#{1,3}/);
    if (headingMark) {
      closeList();
      const tag = `h${headingMark[0].length + 1}`;
      const text = line.slice(headingMark[0].length).trim();
      out.push(`<${tag}>${renderInline(text)}</${tag}>`);
      continue;
    }

    if (/^(?:-{3,}|\*{3,})$/.test(line)) {
      closeList();
      out.push('<hr/>');
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    if (/^[-*•]\s/.test(line)) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      const text = line.replace(/^[-*•]\s+/, '');
      out.push(`<li>${renderInline(text)}</li>`);
      continue;
    }

    const olMark = line.match(/^\d+[.、)]/);
    if (olMark) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      const text = line.slice(olMark[0].length).trim();
      out.push(`<li>${renderInline(text)}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  return out.join('\n');
};

const LegalPage: FC<{ type: 'terms' | 'privacy' }> = ({ type }) => {
  const [content, setContent] = useState<string>('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const title = type === 'terms' ? '服务条款' : '隐私政策';

  useEffect(() => {
    fetch('/webapi/legal')
      .then((r) => r.json())
      .then((d) => setContent(type === 'terms' ? (d.terms ?? '') : (d.privacy ?? '')))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [type]);

  // Scoped stylesheet instead of inline styles: the auth bundle has no
  // antd theme provider, so --lobe-color-* vars are undefined here and every
  // color must be explicit. Dark mode follows the OS via prefers-color-scheme,
  // matching the black body the auth HTML shell paints before React mounts.
  const css = `
.legal-page{align-items:center;background:#f5f6f8;box-sizing:border-box;display:flex;justify-content:center;min-height:100vh;padding:48px 16px;}
.legal-card{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.06);box-sizing:border-box;color:#25292e;max-width:760px;padding:48px 56px;width:100%;}
.legal-card h1{font-size:26px;font-weight:700;margin:0 0 8px;}
.legal-card h2{font-size:20px;font-weight:600;margin:32px 0 12px;}
.legal-card h3{font-size:17px;font-weight:600;margin:24px 0 8px;}
.legal-card p{font-size:15px;line-height:1.9;margin:0 0 14px;}
.legal-card ul,.legal-card ol{font-size:15px;line-height:1.9;margin:0 0 14px;padding-left:24px;}
.legal-card li{margin-bottom:6px;}
.legal-card blockquote{background:#f8f9fb;border-left:3px solid #d0d5dd;border-radius:4px;color:#5a6472;font-size:14px;line-height:1.8;margin:0 0 14px;padding:8px 16px;}
.legal-card hr{border:none;border-top:1px solid #e4e7ec;margin:28px 0;}
.legal-card a{color:#1677ff;}
.legal-card code{background:#f2f3f5;border-radius:4px;font-size:13px;padding:2px 6px;}
.legal-card strong{font-weight:600;}
.legal-back{display:inline-block;margin-top:36px;}
.legal-state{color:#8a919c;padding:48px 0;text-align:center;}
@media (max-width:640px){.legal-page{padding:0;}.legal-card{border-radius:0;box-shadow:none;padding:28px 20px;}}
@media (prefers-color-scheme:dark){
.legal-page{background:#141414;}
.legal-card{background:#1f1f1f;box-shadow:0 2px 16px rgba(0,0,0,.4);color:#e8e9ea;}
.legal-card blockquote{background:#292929;border-left-color:#3d3d3d;color:#b9bdc1;}
.legal-card code{background:#2e2e2e;}
.legal-card hr{border-top-color:#383838;}
}`;

  return (
    <div className="legal-page">
      <style>{css}</style>
      <article className="legal-card">
        <h1>{title}</h1>
        {loading ? (
          <div className="legal-state">加载中…</div>
        ) : failed ? (
          <div className="legal-state">内容加载失败，请刷新重试。</div>
        ) : !content ? (
          <div className="legal-state">暂未配置{title}内容，请联系管理员。</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        )}
        <div>
          <a className="legal-back" href="/signin">
            ← 返回登录
          </a>
        </div>
      </article>
    </div>
  );
};

export default LegalPage;
