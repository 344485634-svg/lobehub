'use client';

import { Button } from '@lobehub/ui';
import { ModalFooter, useModalContext } from '@lobehub/ui/base-ui';
import { type FormInstance } from 'antd';
import { App } from 'antd';
import isEqual from 'fast-deep-equal';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

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
  const existingModel = useAiInfraStore(aiModelSelectors.getAiModelById(id), isEqual);

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
              supportedResolutions,
              videoRateByRes,
              // strip form-only / non-updatable fields
              id: _id,
              providerId: _providerId,
              source: _source,
              enabled: _enabled,
              pricing: prevPricing,
              ...rest
            } = data;

            // Rates keyed by the ticked resolutions (lowercased to match the
            // billing lookup's normalizeVideoResolution). Built fresh — a
            // resolution left unticked can't be selected by users, so its
            // stale entry is dropped rather than seeded from the old table.
            const rateResolutions: string[] =
              Array.isArray(supportedResolutions) && supportedResolutions.length > 0
                ? (supportedResolutions as string[])
                : ['480p', '720p', '1080p'];
            const rates = (videoRateByRes || {}) as Record<string, unknown>;
            const byRes: Record<string, number> = {};
            for (const res of rateResolutions) {
              const v = rates[res];
              if (v != null && v !== '') byRes[res.toLowerCase()] = toNonNegNumber(v);
            }

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

            // Per-model resolution config → parameters.resolution { default, enum }.
            // Deep-merges over the model-bank schema downstream and drives the
            // frontend resolution tabs.
            const parameters: Record<string, unknown> = {
              ...(((existingModel as any)?.parameters || {}) as object),
            };
            if (Array.isArray(supportedResolutions) && supportedResolutions.length > 0) {
              parameters.resolution = {
                default: (supportedResolutions as string[])[0],
                enum: supportedResolutions,
              };
              // `prompt` is the only mandatory key in the video schema parser —
              // gateway models start from empty parameters and need it seeded.
              if (!parameters.prompt) {
                parameters.prompt = { default: '' };
              }
            } else {
              delete parameters.resolution;
            }

            // Only send schema-allowed keys
            const payload: Record<string, unknown> = { parameters, pricing };
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
            if (rest.settings && typeof rest.settings === 'object')
              payload.settings = rest.settings;
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
