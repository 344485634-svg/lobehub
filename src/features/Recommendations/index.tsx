import { Flexbox, Text } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useEligibleActions } from './hooks/useEligibleActions';
import { RecommendationCard } from './RecommendationCard';
import { styles } from './style';

/**
 * 商业化：不再拉取 market 任务模板（taskTemplate.listDailyRecommend 会持续 429/报错）。
 * 仅保留本地可执行的推荐动作（若有）。
 */
export const useRecommendationsVisible = (): boolean => {
  const { actions } = useEligibleActions();
  return actions.length > 0;
};

const Recommendations = memo(() => {
  const { t } = useTranslation('home');
  const { actions } = useEligibleActions();

  if (actions.length === 0) return null;

  return (
    <Flexbox gap={12}>
      <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
        <Text className={styles.subtitle} fontSize={12}>
          {t('recommendations.subtitle')}
        </Text>
      </Flexbox>
      <Flexbox gap={8}>
        {actions.map((action) => (
          <RecommendationCard
            ctaKey={action.ctaKey}
            descriptionKey={action.descriptionKey}
            i18nValues={action.i18nValues}
            icon={action.icon}
            key={action.id}
            tagKey={action.tagKey}
            titleKey={action.titleKey}
            onAction={action.run}
          />
        ))}
      </Flexbox>
    </Flexbox>
  );
});

Recommendations.displayName = 'Recommendations';

export default Recommendations;
