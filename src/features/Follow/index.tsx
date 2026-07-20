'use client';

import { memo } from 'react';

// 商业化白标：移除「关注我们」上游社交图标条（GitHub/X/Discord/Medium 均指向原项目）。
// 保留组件导出以兼容现有引用处，渲染为空。
const Follow = memo(() => {
  return null;
});

Follow.displayName = 'Follow';

export default Follow;
