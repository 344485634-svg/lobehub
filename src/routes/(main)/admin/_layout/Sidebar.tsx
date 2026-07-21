'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { CreditCard, Key, LayoutDashboard, Package, Users, Zap } from 'lucide-react';
import { memo } from 'react';
import { Link, useLocation } from 'react-router';

const Sidebar = memo(() => {
  const { pathname } = useLocation();

  const items = [
    { icon: LayoutDashboard, key: '/admin', label: '概览' },
    { icon: Users, key: '/admin/users', label: '用户' },
    { icon: Package, key: '/admin/plans', label: '套餐' },
    { icon: CreditCard, key: '/admin/subscriptions', label: '订阅' },
    { icon: Key, key: '/admin/api-keys', label: 'API 密钥' },
    { icon: Zap, key: '/admin/skills', label: '技能' },
  ];

  return (
    <Flexbox gap={4} padding={12} style={{ width: 220 }}>
      {items.map((item) => (
        <Link key={item.key} style={{ color: 'inherit' }} to={item.key}>
          <Flexbox
            horizontal
            align="center"
            gap={8}
            padding={8}
            style={{
              background: pathname === item.key ? 'var(--lobe-color-fill-tertiary)' : undefined,
              borderRadius: 8,
            }}
          >
            <Icon icon={item.icon} />
            {item.label}
          </Flexbox>
        </Link>
      ))}
    </Flexbox>
  );
});

Sidebar.displayName = 'AdminSidebar';

export default Sidebar;
