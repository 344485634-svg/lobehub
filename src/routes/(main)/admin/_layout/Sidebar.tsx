'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Key, LayoutDashboard, Users, Zap } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

const Sidebar = memo(() => {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();

  const items = [
    {
      icon: LayoutDashboard,
      key: '/admin',
      label: t('admin.dashboard', { defaultValue: 'Dashboard' }),
    },
    { icon: Users, key: '/admin/users', label: t('admin.users', { defaultValue: 'Users' }) },
    { icon: Key, key: '/admin/api-keys', label: t('admin.apiKeys', { defaultValue: 'API Keys' }) },
    { icon: Zap, key: '/admin/skills', label: t('admin.skills', { defaultValue: 'Skills' }) },
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
