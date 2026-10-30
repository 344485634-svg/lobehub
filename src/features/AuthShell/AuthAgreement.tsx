'use client';

import { Text } from '@lobehub/ui';
import { type CSSProperties, memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

const linkStyle: CSSProperties = {
  color: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
};

const AuthAgreement = memo(() => {
  const { t } = useTranslation('auth');
  return (
    <Text fontSize={13} style={{ display: 'block', marginBlockStart: 8 }} type={'secondary'}>
      <Trans
        i18nKey={'footer.agreement'}
        ns={'auth'}
        components={{
          privacy: (
            <a href="/privacy" style={linkStyle} target="_blank" rel="noreferrer">
              {t('footer.privacy')}
            </a>
          ),
          terms: (
            <a href="/terms" style={linkStyle} target="_blank" rel="noreferrer">
              {t('footer.terms')}
            </a>
          ),
        }}
      />
    </Text>
  );
});

export default AuthAgreement;
