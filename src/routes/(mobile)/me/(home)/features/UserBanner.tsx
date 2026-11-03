'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import DataStatistics from '@/features/User/DataStatistics';
import UserInfo from '@/features/User/UserInfo';
import UserLoginOrSignup from '@/features/User/UserLoginOrSignup/Community';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

const UserBanner = memo(() => {
  const isLoginWithAuth = useUserStore(authSelectors.isLoginWithAuth);
  const [signIn] = useUserStore((s) => [s.openLogin]);

  return (
    <Flexbox gap={12} paddingBlock={8}>
      {isLoginWithAuth ? (
        <>
          <WorkspaceLink style={{ color: 'inherit' }} to="/settings/profile">
            <UserInfo />
          </WorkspaceLink>
          {/* 每张统计卡在 DataStatistics 内部自带跳转(助理/消息→数据统计,积分→积分页) */}
          <DataStatistics paddingInline={12} />
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
