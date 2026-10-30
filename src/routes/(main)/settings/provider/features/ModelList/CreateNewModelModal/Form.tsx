import { Input } from '@lobehub/ui';
import { Select } from '@lobehub/ui/base-ui';
import type { FormInstance } from 'antd';
import { Checkbox, Form, InputNumber } from 'antd';
import type { AiModelType } from 'model-bank';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import MaxTokenSlider from '@/components/MaxTokenSlider';
import { useIsMobile } from '@/hooks/useIsMobile';
import { type ChatModelCard } from '@/types/llm';

import ExtendParamsSelect from './ExtendParamsSelect';
import { hasDuplicateModelId } from './utils';

interface ModelConfigFormProps {
  disabled?: boolean;
  existingModelIds?: string[];
  idEditable?: boolean;
  initialValues?: ChatModelCard;
  onFormInstanceReady: (instance: FormInstance) => void;
  showDeployName?: boolean;
  type?: AiModelType;
}

const ModelConfigForm = memo<ModelConfigFormProps>(
  ({
    showDeployName,
    idEditable = true,
    onFormInstanceReady,
    initialValues,
    disabled,
    existingModelIds = [],
  }) => {
    const { t } = useTranslation('modelProvider');

    const [formInstance] = Form.useForm();

    const isMobile = useIsMobile();

    const modelTypeOptions = useMemo(
      () =>
        (
          [
            'chat',
            'embedding',
            'tts',
            'asr',
            'image',
            'video',
            'text2music',
            'realtime',
          ] as AiModelType[]
        ).map((value) => {
          const label = t(`providerModels.item.modelConfig.type.options.${value}`);

          return {
            label: label !== value ? `${label} (${value})` : label,
            value,
          };
        }),
      [t],
    );

    useEffect(() => {
      onFormInstanceReady(formInstance);
    }, []);

    const modelType =
      Form.useWatch('type', formInstance) || initialValues?.type || type || 'chat';

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
      >
        <Form
          colon={false}
          disabled={disabled}
          form={formInstance}
          labelCol={{ span: 4 }}
          style={{ marginTop: 16 }}
          wrapperCol={isMobile ? { span: 18 } : { offset: 1, span: 18 }}
          initialValues={{
            ...initialValues,
            creditsPerMillionInputTokens:
              (initialValues as any)?.pricing?.creditsPerMillionInputTokens ?? 0,
            creditsPerMillionOutputTokens:
              (initialValues as any)?.pricing?.creditsPerMillionOutputTokens ?? 0,
            creditsPerRequest: (initialValues as any)?.pricing?.creditsPerRequest ?? 0,
            videoCreditsPerSecond: (initialValues as any)?.pricing?.videoCreditsPerSecond ?? 0,
            videoRate480p:
              (initialValues as any)?.pricing?.videoCreditsPerSecondByResolution?.['480p'] ??
              undefined,
            videoRate720p:
              (initialValues as any)?.pricing?.videoCreditsPerSecondByResolution?.['720p'] ??
              undefined,
            videoRate1080p:
              (initialValues as any)?.pricing?.videoCreditsPerSecondByResolution?.['1080p'] ??
              undefined,
            type: initialValues?.type || type || 'chat',
          }}
        >
          <Form.Item
            extra={t('providerModels.item.modelConfig.id.extra')}
            label={t('providerModels.item.modelConfig.id.title')}
            name={'id'}
            rules={[
              { required: true },
              {
                validator: async (_, value?: string) => {
                  if (hasDuplicateModelId(value, existingModelIds)) {
                    throw new Error(t('providerModels.item.modelConfig.id.duplicate'));
                  }
                },
              },
            ]}
          >
            <Input
              disabled={disabled || !idEditable}
              placeholder={t('providerModels.item.modelConfig.id.placeholder')}
            />
          </Form.Item>
          {showDeployName && (
            <Form.Item
              extra={t('providerModels.item.modelConfig.deployName.extra')}
              label={t('providerModels.item.modelConfig.deployName.title')}
              name={['config', 'deploymentName']}
            >
              <Input placeholder={t('providerModels.item.modelConfig.deployName.placeholder')} />
            </Form.Item>
          )}
          <Form.Item
            label={t('providerModels.item.modelConfig.displayName.title')}
            name={'displayName'}
          >
            <Input placeholder={t('providerModels.item.modelConfig.displayName.placeholder')} />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.tokens.extra')}
            label={t('providerModels.item.modelConfig.tokens.title')}
            name={'contextWindowTokens'}
          >
            <MaxTokenSlider />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.extendParams.extra')}
            label={t('providerModels.item.modelConfig.extendParams.title')}
            name={['settings', 'extendParams']}
          >
            <ExtendParamsSelect />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.functionCall.extra')}
            label={t('providerModels.item.modelConfig.functionCall.title')}
            name={['abilities', 'functionCall']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.vision.extra')}
            label={t('providerModels.item.modelConfig.vision.title')}
            name={['abilities', 'vision']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.reasoning.extra')}
            label={t('providerModels.item.modelConfig.reasoning.title')}
            name={['abilities', 'reasoning']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.search.extra')}
            label={t('providerModels.item.modelConfig.search.title')}
            name={['abilities', 'search']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>

          <Form.Item
            extra={t('providerModels.item.modelConfig.imageOutput.extra')}
            label={t('providerModels.item.modelConfig.imageOutput.title')}
            name={['abilities', 'imageOutput']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.video.extra')}
            label={t('providerModels.item.modelConfig.video.title')}
            name={['abilities', 'video']}
            valuePropName={'checked'}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            extra={t('providerModels.item.modelConfig.type.extra')}
            label={t('providerModels.item.modelConfig.type.title')}
            name={'type'}
          >
            <Select
              options={modelTypeOptions}
              placeholder={t('providerModels.item.modelConfig.type.placeholder')}
            />
          </Form.Item>

          {(modelType === 'chat' || modelType === 'embedding') && (
            <>
              <Form.Item
                extra="每 100 万 input tokens 扣除的积分，例如 5"
                label="输入积分/百万tokens"
                name="creditsPerMillionInputTokens"
              >
                <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="每 100 万 output tokens 扣除的积分，例如 10"
                label="输出积分/百万tokens"
                name="creditsPerMillionOutputTokens"
              >
                <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {modelType === 'image' && (
            <Form.Item
              extra="每次图片生成扣除的积分（多图按张数累加）"
              label="积分/次"
              name="creditsPerRequest"
            >
              <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
          )}

          {modelType === 'video' && (
            <>
              <Form.Item extra="480p 每秒扣除积分" label="480p 积分/秒" name="videoRate480p">
                <InputNumber min={0} placeholder="可选" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item extra="720p 每秒扣除积分，例如 10" label="720p 积分/秒" name="videoRate720p">
                <InputNumber min={0} placeholder="10" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item extra="1080p 每秒扣除积分" label="1080p 积分/秒" name="videoRate1080p">
                <InputNumber min={0} placeholder="可选" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="分辨率未命中时的默认每秒积分"
                label="默认积分/秒"
                name="videoCreditsPerSecond"
              >
                <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {!['chat', 'embedding', 'image', 'video'].includes(String(modelType)) && (
            <Form.Item
              extra="用户每次调用该模型扣除的积分点（0 表示不扣）"
              label="积分/次"
              name="creditsPerRequest"
            >
              <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
          )}
          {/*<Form.Item*/}
          {/*  extra={t('providerModels.item.modelConfig.files.extra')}*/}
          {/*  label={t('providerModels.item.modelConfig.files.title')}*/}
          {/*  name={['abilities', 'files']}*/}
          {/*  valuePropName={'checked'}*/}
          {/*>*/}
          {/*  <Checkbox />*/}
          {/*</Form.Item>*/}
        </Form>
      </div>
    );
  },
);
export default ModelConfigForm;
