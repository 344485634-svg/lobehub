'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  Blocks,
  Brain,
  BrainCircuit,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Mail,
  Package,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
import { Link, useLocation } from 'react-router';

import { styles } from './style';

const Sidebar = memo(() => {
  const { pathname } = useLocation();

  const items = [
    { icon: LayoutDashboard, key: '/admin', label: '概览' },
    { icon: Users, key: '/admin/users', label: '用户' },
    { icon: Package, key: '/admin/plans', label: '套餐' },
    { icon: CreditCard, key: '/admin/subscriptions', label: '订阅' },
    { icon: Wallet, key: '/admin/payment', label: '支付配置' },
    { icon: Mail, key: '/admin/email', label: '邮箱配置' },
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
    <Flexbox className={styles.sidebar} gap={4} padding={12}>
      <div
        style={{
          color: 'var(--lobe-color-text-secondary)',
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 8,
          paddingInline: 8,
        }}
      >
        管理后台
      </div>
      {items.map((item) => {
        const active = isActive(item.key);
        return (
          <Link className={styles.sidebarItem} key={item.key} to={item.key}>
            <Flexbox
              horizontal
              align="center"
              className={`${styles.sidebarItemInner}${active ? ` ${styles.sidebarItemActive}` : ''}`}
              gap={8}
              padding={8}
            >
              <Icon icon={item.icon} size={16} />
              <span style={{ fontSize: 14 }}>{item.label}</span>
            </Flexbox>
          </Link>
        );
      })}
    </Flexbox>
  );
});

Sidebar.displayName = 'AdminSidebar';

export default Sidebar;
