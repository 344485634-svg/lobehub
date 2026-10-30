'use client';

import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

import DataStatistics from '@/features/User/DataStatistics';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

/**
 * Statistics section of the user panel.
 * 商业功能开启时,第二张卡是积分余额 —— 点击跳转积分页(而非数据统计);
 * 其余场景保持跳数据统计页。PC 端昵称面板与移动端「我的」页同口径。
 */
export default function UserPanelStatistics() {
  const enableBusinessFeatures = useServerConfigStore(
    serverConfigSelectors.enableBusinessFeatures,
  );

  const to = enableBusinessFeatures ? '/settings/credits' : '/settings/stats';

  return (
    <WorkspaceLink style={{ color: 'inherit' }} to={to}>
      <DataStatistics />
    </WorkspaceLink>
  );
}
