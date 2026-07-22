'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import Sidebar from './Sidebar';
import { styles } from './style';

const DesktopAdminLayout: FC = () => {
  const navigate = useNavigate();
  const isLoaded = useUserStore(authSelectors.isLoaded);
  const isAdmin = useUserStore(authSelectors.isAdmin);

  useEffect(() => {
    if (isLoaded && !isAdmin) navigate('/', { replace: true });
  }, [isLoaded, isAdmin, navigate]);

  if (!isLoaded) return <Loading debugId="AdminLayout" />;
  if (!isAdmin) return null;

  return (
    <Flexbox horizontal className={styles.root} height="100%" width="100%">
      <Sidebar />
      <Flexbox className={styles.mainContainer} flex={1} height="100%">
        <Outlet />
      </Flexbox>
    </Flexbox>
  );
};

export default DesktopAdminLayout;
