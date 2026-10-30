'use client';

import { Button } from '@lobehub/ui';
import { ModalFooter, useModalContext } from '@lobehub/ui/base-ui';
import { type FormInstance } from 'antd';
import { App } from 'antd';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiInfraStore } from '@/store/aiInfra';

interface ModelConfigFooterProps {
  formRef: { current?: FormInstance };
  id: string;
}

const toNonNegNumber = (v: unknown, fallback = 0) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const ModelConfigFooter = memo<ModelConfigFooterProps>(({ formRef, id }) => {
  const { t } = useTranslation('common');
  const { message } = App.useApp();
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);
  const [editingProvider, updateAiModelsConfig] = useAiInfraStore((s) => [
    s.activeAiProvider!,
    s.updateAiModelsConfig,
  ]);

  return (
    <ModalFooter>
      <Button onClick={close}>{t('cancel')}</Button>
      <Button
        loading={loading}
        type="primary"
        onClick={async () => {
          const form = formRef.current;
          if (!editingProvider || !id || !form) return;

          setLoading(true);
          try {
            const data = form.getFieldsValue(true) || {};
            const {
              creditsPerRequest,
              creditsPerMillionInputTokens,
              creditsPerMillionOutputTokens,
              videoCreditsPerSecond,
              videoRate480p,
              videoRate720p,
              videoRate1080p,
              // strip form-only / non-updatable fields
              id: _id,
              providerId: _providerId,
              source: _source,
              enabled: _enabled,
              pricing: prevPricing,
              ...rest
            } = data;

            const byRes: Record<string, number> = {
              ...((prevPricing as any)?.videoCreditsPerSecondByResolution || {}),
            };
            if (videoRate480p != null && videoRate480p !== '')
              byRes['480p'] = toNonNegNumber(videoRate480p);
            if (videoRate720p != null && videoRate720p !== '')
              byRes['720p'] = toNonNegNumber(videoRate720p);
            if (videoRate1080p != null && videoRate1080p !== '')
              byRes['1080p'] = toNonNegNumber(videoRate1080p);

            // Merge credit fields into existing pricing (keep units / upstream fields)
            const pricing: Record<string, unknown> = {
              ...((prevPricing && typeof prevPricing === 'object' ? prevPricing : {}) as object),
              creditsPerMillionInputTokens: toNonNegNumber(creditsPerMillionInputTokens),
              creditsPerMillionOutputTokens: toNonNegNumber(creditsPerMillionOutputTokens),
              creditsPerRequest: toNonNegNumber(creditsPerRequest),
              videoCreditsPerSecond: toNonNegNumber(videoCreditsPerSecond),
            };
            if (Object.keys(byRes).length > 0) {
              pricing.videoCreditsPerSecondByResolution = byRes;
            }

            // Only send schema-allowed keys
            const payload: Record<string, unknown> = { pricing };
            if (rest.abilities && typeof rest.abilities === 'object') {
              const ab = rest.abilities as Record<string, unknown>;
              payload.abilities = {
                audio: !!ab.audio,
                functionCall: !!ab.functionCall,
                imageOutput: !!ab.imageOutput,
                reasoning: !!ab.reasoning,
                search: !!ab.search,
                video: !!ab.video,
                vision: !!ab.vision,
              };
            }
            if (rest.config && typeof rest.config === 'object') payload.config = rest.config;
            if (rest.contextWindowTokens != null && rest.contextWindowTokens !== '') {
              payload.contextWindowTokens = toNonNegNumber(rest.contextWindowTokens, 0);
            }
            if (rest.displayName != null) payload.displayName = rest.displayName;
            if (rest.settings && typeof rest.settings === 'object') payload.settings = rest.settings;
            if (
              rest.type &&
              [
                'chat',
                'embedding',
                'tts',
                'asr',
                'image',
                'video',
                'text2music',
                'realtime',
              ].includes(String(rest.type))
            ) {
              payload.type = rest.type;
            }

            await updateAiModelsConfig(id, editingProvider, payload as any);
            message.success(t('updateSuccess', { defaultValue: '已保存' }) as string);
            close();
          } catch (e: any) {
            console.error('[ModelConfig] save failed', e);
            message.error(e?.message || '保存模型配置失败');
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

export default ModelConfigFooter;
