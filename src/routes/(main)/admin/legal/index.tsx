'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Tabs } from '@lobehub/ui/base-ui';
import { App, Card } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

// Minimal Markdown editor — use textarea + live preview
const MarkdownEditor: FC<{
  onChange: (v: string) => void;
  placeholder?: string;
  value: string;
}> = ({ value, onChange, placeholder }) => (
  <Flexbox gap={12} style={{ width: '100%' }}>
    <Flexbox horizontal gap={12} style={{ minHeight: 360 }}>
      <textarea
        placeholder={placeholder}
        value={value}
        style={{
          background: 'var(--lobe-color-bg-container)',
          border: '1px solid var(--lobe-color-border)',
          borderRadius: 8,
          color: 'inherit',
          flex: 1,
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 1.6,
          minHeight: 360,
          padding: 12,
          resize: 'vertical',
        }}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        style={{
          border: '1px solid var(--lobe-color-border)',
          borderRadius: 8,
          flex: 1,
          fontSize: 14,
          lineHeight: 1.8,
          minHeight: 360,
          overflow: 'auto',
          padding: 12,
        }}
      />
    </Flexbox>
    <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
      左侧编辑 Markdown，右侧实时预览。支持标准 Markdown 语法。
    </div>
  </Flexbox>
);

function renderMarkdown(md: string): string {
  if (!md) return '<p style="opacity:0.4">预览区（空）</p>';
  return md
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/^### (.+)$/gm, '<h3>$1</h3>')
    .replaceAll(/^## (.+)$/gm, '<h2>$1</h2>')
    .replaceAll(/^# (.+)$/gm, '<h1>$1</h1>')
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    .replaceAll(/`(.+?)`/g, '<code>$1</code>')
    .replaceAll(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replaceAll(/^---$/gm, '<hr/>')
    .replaceAll('\n\n', '</p><p>')
    .replaceAll(/^(?!<[h|puolb])/gm, '')
    .trim()
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

const AdminLegalPage: FC = () => {
  const { message } = App.useApp();
  const [terms, setTerms] = useState('');
  const [privacy, setPrivacy] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, mutate } = useSWR('admin-legal-content', () =>
    lambdaClient.admin.getLegalContent.query(),
  );

  useEffect(() => {
    if (!data) return;
    setTerms(data.terms ?? '');
    setPrivacy(data.privacy ?? '');
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await lambdaClient.admin.setLegalContent.mutate({ privacy, terms });
      message.success('已保存');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flexbox gap={24} padding={24}>
      <Flexbox
        horizontal
        gap={16}
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ fontSize: 22, fontWeight: 700 }}>服务条款 & 隐私政策</div>
        <Button loading={saving} type="primary" onClick={handleSave}>
          保存
        </Button>
      </Flexbox>

      <Card loading={isLoading} size="small" style={{ minHeight: 480 }}>
        <Tabs
          defaultActiveKey="terms"
          items={[
            {
              children: (
                <MarkdownEditor
                  placeholder="在此输入服务条款内容（支持 Markdown）..."
                  value={terms}
                  onChange={setTerms}
                />
              ),
              key: 'terms',
              label: '服务条款',
            },
            {
              children: (
                <MarkdownEditor
                  placeholder="在此输入隐私政策内容（支持 Markdown）..."
                  value={privacy}
                  onChange={setPrivacy}
                />
              ),
              key: 'privacy',
              label: '隐私政策',
            },
          ]}
        />
      </Card>

      <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
        内容保存后将展示给用户。建议使用 Markdown 格式以获得最佳展示效果。
      </div>
    </Flexbox>
  );
};

export default AdminLegalPage;
