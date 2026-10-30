'use client';

import { Button } from '@lobehub/ui';
import { ModalFooter, useModalContext } from '@lobehub/ui/base-ui';
import type { FormInstance } from 'antd';
import { App } from 'antd';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiInfraStore } from '@/store/aiInfra';

interface CreateNewModelFooterProps {
  formRef: { current?: FormInstance };
}

const toNonNegNumber = (v: unknown, fallback = 0) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const CreateNewModelFooter = memo<CreateNewModelFooterProps>(({ formRef }) => {
  const { t } = useTranslation('common');
  const { message } = App.useApp();
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);
  const [editingProvider, createNewAiModel] = useAiInfraStore((s) => [
    s.activeAiProvider!,
    s.createNewAiModel,
  ]);

  return (
    <ModalFooter>
      <Button onClick={close}>{t('cancel')}</Button>
      <Button
        loading={loading}
        type="primary"
        onClick={async () => {
          const form = formRef.current;
          if (!editingProvider || !form) return;

          setLoading(true);
          try {
            await form.validateFields();
            const data = form.getFieldsValue(true) || {};
            const {
              creditsPerRequest,
              creditsPerMillionInputTokens,
              creditsPerMillionOutputTokens,
              videoCreditsPerSecond,
              videoRate480p,
              videoRate720p,
              videoRate1080p,
              ...rest
            } = data;

            const byRes: Record<string, number> = {};
            if (videoRate480p != null && videoRate480p !== '')
              byRes['480p'] = toNonNegNumber(videoRate480p);
            if (videoRate720p != null && videoRate720p !== '')
              byRes['720p'] = toNonNegNumber(videoRate720p);
            if (videoRate1080p != null && videoRate1080p !== '')
              byRes['1080p'] = toNonNegNumber(videoRate1080p);

            await createNewAiModel({
              abilities: rest.abilities,
              config: rest.config,
              contextWindowTokens: rest.contextWindowTokens,
              displayName: rest.displayName,
              id: rest.id,
              pricing: {
                creditsPerMillionInputTokens: toNonNegNumber(creditsPerMillionInputTokens),
                creditsPerMillionOutputTokens: toNonNegNumber(creditsPerMillionOutputTokens),
                creditsPerRequest: toNonNegNumber(creditsPerRequest),
                videoCreditsPerSecond: toNonNegNumber(videoCreditsPerSecond),
                ...(Object.keys(byRes).length
                  ? { videoCreditsPerSecondByResolution: byRes }
                  : {}),
              },
              providerId: editingProvider,
              settings: rest.settings,
              type: rest.type,
            });
            message.success('模型已创建');
            close();
          } catch (e: any) {
            if (e?.errorFields) return;
            console.error('[CreateModel] failed', e);
            message.error(e?.message || '创建模型失败');
          } finally {
            setLoading(false);
          }
        }}
      >
        {t('ok')}
      </Button>
    </ModalFooter>
  );
});

export default CreateNewModelFooter;
