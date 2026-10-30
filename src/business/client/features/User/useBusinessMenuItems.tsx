import { CreditCard, Gem } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

/**
 * 用户面板的商业功能菜单(积分/套餐入口)。
 * 受 enableBusinessFeatures 门控——开关关闭时保持隐藏,不影响开源形态。
 */
export default function useBusinessMenuItems(isSignin: boolean | undefined) {
  const { t } = useTranslation('subscription');
  const enableBusinessFeatures = useServerConfigStore(
    serverConfigSelectors.enableBusinessFeatures,
  );

  return useMemo(() => {
    if (!isSignin || !enableBusinessFeatures) return [];

    return [
      {
        icon: <Gem size={16} />,
        key: 'credits',
        label: <Link to="/settings/credits">{t('tab.credits')}</Link>,
      },
      {
        icon: <CreditCard size={16} />,
        key: 'plans',
        label: <Link to="/settings/plans">{t('tab.plans')}</Link>,
      },
    ];
  }, [isSignin, enableBusinessFeatures, t]);
}
