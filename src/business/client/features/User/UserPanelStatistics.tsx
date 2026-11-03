'use client';

import DataStatistics from '@/features/User/DataStatistics';

/**
 * Statistics section of the user panel.
 * 每张统计卡在 DataStatistics 内部自带跳转(助理/消息→数据统计,积分→积分页),
 * 这里不再整块包一层链接,避免覆盖子卡的目标地址。
 */
export default function UserPanelStatistics() {
  return <DataStatistics />;
}
