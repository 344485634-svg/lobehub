import { Flexbox } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { type FC } from 'react';

import { styles } from '../styles';

interface FooterProps {
  onClose: () => void;
}

/**
 * Closed product: non-admin users cannot manage providers.
 * Hide the previous "manage provider / go to settings" footer entry.
 */
export const Footer: FC<FooterProps> = () => {
  return (
    <Flexbox className={styles.footer} padding={4}>
      <Flexbox
        horizontal
        gap={8}
        paddingBlock={8}
        paddingInline={12}
        style={{ color: cssVar.colorTextTertiary, fontSize: 12 }}
      >
        模型由管理员统一配置，如需开通请联系管理员
      </Flexbox>
    </Flexbox>
  );
};
