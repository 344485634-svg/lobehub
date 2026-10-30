'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import DataStatistics from '@/features/User/DataStatistics';
import UserInfo from '@/features/User/UserInfo';
import UserLoginOrSignup from '@/features/User/UserLoginOrSignup/Community';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

const UserBanner = memo(() => {
  const isLoginWithAuth = useUserStore(authSelectors.isLoginWithAuth);
  const [signIn] = useUserStore((s) => [s.openLogin]);
  const enableBusinessFeatures = useServerConfigStore(
    serverConfigSelectors.enableBusinessFeatures,
  );

  // 移动端统计卡含积分余额时,点击跳积分页;纯统计模式跳数据统计页
  const statsLink = enableBusinessFeatures ? '/settings/credits' : '/settings/stats';

  return (
    <Flexbox gap={12} paddingBlock={8}>
      {isLoginWithAuth ? (
        <>
          <WorkspaceLink style={{ color: 'inherit' }} to="/settings/profile">
            <UserInfo />
          </WorkspaceLink>
          <WorkspaceLink style={{ color: 'inherit' }} to={statsLink}>
            <DataStatistics paddingInline={12} />
          </WorkspaceLink>
        </>
      ) : (
        <UserLoginOrSignup
          onClick={() => {
            signIn();
          }}
        />
      )}
    </Flexbox>
  );
});

export default UserBanner;
