'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  Blocks,
  Brain,
  BrainCircuit,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Package,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
import { Link, useLocation } from 'react-router';

const Sidebar = memo(() => {
  const { pathname } = useLocation();

  const items = [
    { icon: LayoutDashboard, key: '/admin', label: '概览' },
    { icon: Users, key: '/admin/users', label: '用户' },
    { icon: Package, key: '/admin/plans', label: '套餐' },
    { icon: CreditCard, key: '/admin/subscriptions', label: '订阅' },
    { icon: Brain, key: '/admin/provider', label: '模型服务商' },
    { icon: Sparkles, key: '/admin/service-model', label: '服务模型' },
    { icon: Zap, key: '/admin/skills', label: '技能' },
    { icon: Blocks, key: '/admin/connector', label: '连接器' },
    { icon: BrainCircuit, key: '/admin/memory', label: '记忆' },
    { icon: KeyRound, key: '/admin/creds', label: '凭证' },
  ];

  const isActive = (key: string) => {
    if (key === '/admin') return pathname === '/admin' || pathname === '/admin/';
    return pathname === key || pathname.startsWith(`${key}/`);
  };

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
              background: isActive(item.key) ? 'var(--lobe-color-fill-tertiary)' : undefined,
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
