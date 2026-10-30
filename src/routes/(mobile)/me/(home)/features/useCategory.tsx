import { LOBE_CHAT_CLOUD, UTM_SOURCE } from '@lobechat/business-const';
import { DOWNLOAD_URL, OFFICIAL_URL } from '@lobechat/const';
import {
  Book,
  CircleUserRound,
  Cloudy,
  Download,
  Feather,
  FileClockIcon,
  ImagePlus,
  LogOut,
  Settings2,
  Video,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import useBusinessMeCells from '@/business/client/features/User/useBusinessMeCells';
import { type CellProps } from '@/components/Cell';
import { openChangelogModal } from '@/components/ChangelogModal';
import { openFeedbackModal } from '@/components/FeedbackModal';
import { DOCUMENTS } from '@/const/index';
import { usePlatform } from '@/hooks/usePlatform';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

export const useCategory = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['common', 'setting', 'auth']);
  const { showCloudPromotion, hideDocs } = useServerConfigStore(featureFlagsSelectors);
  const [isLoginWithAuth] = useUserStore((s) => [authSelectors.isLoginWithAuth(s)]);
  const { isIOS, isAndroid } = usePlatform();
  const businessMeCells = useBusinessMeCells();

  const downloadUrl = useMemo(() => {
    if (isIOS) return DOWNLOAD_URL.ios;
    if (isAndroid) return DOWNLOAD_URL.android;
    return DOWNLOAD_URL.default;
  }, [isIOS, isAndroid]);

  const profile: CellProps[] = [
    {
      icon: CircleUserRound,
      key: 'profile',
      label: t('userPanel.profile'),
      onClick: () => navigate('/me/profile'),
    },
  ];

  const settings: CellProps[] = [
    {
      icon: Settings2,
      key: 'setting',
      label: t('userPanel.setting'),
      onClick: () => navigate('/me/settings'),
    },
    {
      type: 'divider',
    },
  ];

  // 生图/生视频:与桌面端功能对齐,移动端经 /me 直达(路由复用桌面页)
  const create: CellProps[] = [
    {
      icon: ImagePlus,
      key: 'image',
      label: t('navigation.image', { ns: 'electron' }),
      onClick: () => navigate('/image'),
    },
    {
      icon: Video,
      key: 'video',
      label: t('navigation.video', { ns: 'electron' }),
      onClick: () => navigate('/video'),
    },
    {
      type: 'divider',
    },
  ];

  const getDesktopApp: CellProps[] = [
    {
      icon: Download,
      key: 'get-desktop-app',
      label: t('getDesktopApp'),
      onClick: () => window.open(downloadUrl, '__blank'),
    },
    {
      type: 'divider',
    },
  ];

  const helps: CellProps[] = [
    showCloudPromotion && {
      icon: Cloudy,
      key: 'cloud',
      label: t('userPanel.cloud', { name: LOBE_CHAT_CLOUD }),
      onClick: () => window.open(`${OFFICIAL_URL}?utm_source=${UTM_SOURCE}`, '__blank'),
    },
    {
      icon: Book,
      key: 'docs',
      label: t('document'),
      onClick: () => window.open(DOCUMENTS, '__blank'),
    },
    {
      icon: Feather,
      key: 'feedback',
      label: t('feedback'),
      onClick: () => openFeedbackModal(),
    },
    {
      icon: FileClockIcon,
      key: 'changelog',
      label: t('changelog'),
      onClick: () => openChangelogModal(),
    },
  ].filter(Boolean) as CellProps[];

  const mainItems = [
    {
      type: 'divider',
    },
    ...(isLoginWithAuth ? profile : []),
    ...(isLoginWithAuth ? settings : []),
    ...(isLoginWithAuth ? create : []),
    ...(isLoginWithAuth ? businessMeCells : []),
    ...getDesktopApp,
    ...(!hideDocs ? helps : []),
    ...(isLoginWithAuth
      ? ([
          { type: 'divider' },
          {
            icon: LogOut,
            key: 'logout',
            label: t('signout', { ns: 'auth' }),
            onClick: () => {
              void useUserStore.getState().logout();
            },
          },
        ] as CellProps[])
      : []),
  ].filter(Boolean) as CellProps[];

  return mainItems;
};
