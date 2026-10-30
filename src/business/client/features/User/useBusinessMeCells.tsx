import { CreditCard, Gem } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { type CellProps } from '@/components/Cell';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

/**
 * 移动端「我的」页的商业功能入口(积分/套餐)。
 * 受 enableBusinessFeatures 门控——与桌面端设置页订阅分组保持一致,
 * 开关关闭时保持隐藏。
 */
export default function useBusinessMeCells(): CellProps[] {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();
  const enableBusinessFeatures = useServerConfigStore(
    serverConfigSelectors.enableBusinessFeatures,
  );

  return useMemo(() => {
    if (!enableBusinessFeatures) return [];

    return [
      {
        icon: Gem,
        key: 'credits',
        label: t('tab.credits'),
        onClick: () => navigate('/settings/credits'),
      },
      {
        icon: CreditCard,
        key: 'plans',
        label: t('tab.plans'),
        onClick: () => navigate('/settings/plans'),
      },
      {
        type: 'divider',
      },
    ];
  }, [enableBusinessFeatures, navigate, t]);
}
