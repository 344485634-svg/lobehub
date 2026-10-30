'use client';

import { DOWNLOAD_URL, isDesktop } from '@lobechat/const';
import { Block, Flexbox, Icon, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { createStaticStyles, cx } from 'antd-style';
import { Download, Monitor, Smartphone } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { AndroidPlatformIcon, ApplePlatformIcon } from './MobilePlatformIcons';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actionRow: css`
    flex-wrap: wrap;
    margin-block-start: auto;
  `,
  card: css`
    min-height: 260px;
    padding: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  cliCard: css`
    overflow: hidden;
    grid-column: 1 / -1;
    grid-row: 3;

    min-height: 240px;
    padding: 0;
    border-color: ${cssVar.colorBorder};

    background: transparent;

    @media (width <= 860px) {
      grid-column: auto;
      grid-row: auto;
    }
  `,
  cliCommand: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font: inherit;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  cliInstallLine: css`
    display: flex;
    gap: 8px;
    align-items: center;

    width: fit-content;
    min-width: 0;
    max-width: 100%;
  `,
  terminalBody: css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    padding: 24px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSize};
    line-height: 1.57;

    @media (width <= 520px) {
      padding: 16px;
    }
  `,
  terminalControl: css`
    width: 10px;
    height: 10px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px ${cssVar.colorFill};
  `,
  terminalControlError: css`
    background: ${cssVar.colorError};
  `,
  terminalControlSuccess: css`
    background: ${cssVar.colorSuccess};
  `,
  terminalControlWarning: css`
    background: ${cssVar.colorWarning};
  `,
  terminalControls: css`
    display: flex;
    gap: 8px;
  `,
  terminalHeader: css`
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;

    min-height: 44px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  terminalLabel: css`
    display: flex;
    gap: 8px;
    align-items: center;

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextTertiary};
  `,
  terminalLine: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  terminalOutput: css`
    min-width: max-content;
    margin: 0;

    font: inherit;
    color: ${cssVar.colorTextSecondary};
    white-space: pre;
  `,
  terminalOutputViewport: css`
    height: 360px;

    @media (width <= 520px) {
      height: 320px;
    }
  `,
  terminalPath: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  terminalPrompt: css`
    flex-shrink: 0;
    font-weight: ${cssVar.fontWeightStrong};
    color: ${cssVar.colorSuccess};
  `,
  terminalTheme: css`
    min-height: 240px;
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    width: min(100%, 1120px);
    margin-block: 0;
    margin-inline: auto;
    padding-block: 32px 96px;
    padding-inline: 24px;

    @media (width <= 760px) {
      padding-block-start: 16px;
      padding-inline: 16px;
    }
  `,
  bentoGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;

    @media (width <= 860px) {
      grid-template-columns: 1fr;
    }
  `,
  iconBox: css`
    width: 44px;
    height: 44px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  page: css`
    overflow-y: auto;
    height: 100%;
    min-height: 100%;
    background: ${cssVar.colorBgLayout};
  `,
  pageHeader: css`
    margin-block-end: 24px;
    text-align: start;
  `,
  pageTitle: css`
    margin: 0;
    font-size: 30px;
    line-height: 1.2;
    letter-spacing: 0;
  `,
  platformGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-block: 22px;

    @media (width <= 520px) {
      grid-template-columns: 1fr;
    }
  `,
  platformItem: css`
    cursor: pointer;

    justify-content: flex-start;

    width: 100%;
    min-height: 44px;
    padding-inline: 12px;
    border-radius: 10px;

    color: ${cssVar.colorText};
    text-align: start;

    background: ${cssVar.colorFillQuaternary};

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  platformChevron: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  platformIcon: css`
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    line-height: 0;
  `,
  platformLabel: css`
    display: inline-flex;
    flex: 1;
    gap: 6px;
    align-items: center;

    min-width: 0;
  `,
  platformName: css`
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  platformVerified: css`
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;

    line-height: 0;
    color: ${cssVar.colorSuccess};
  `,
  desktopCard: css`
    /* placement flows automatically from the bento grid */
  `,
  messengerCard: css`
    grid-column: 2;
    grid-row: 1 / span 2;

    @media (width <= 860px) {
      grid-column: auto;
      grid-row: auto;
    }
  `,
  mobileCard: css`
    /* placement flows automatically from the bento grid */
  `,
  mobilePlatformIcons: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: ${cssVar.colorTextTertiary};
  `,
  desktopBentoGrid: css`
    grid-template-columns: 1fr;
  `,
  desktopCliCard: css`
    grid-row: 2;

    @media (width <= 860px) {
      grid-row: auto;
    }
  `,
  desktopMessengerCard: css`
    grid-row: 1;

    @media (width <= 860px) {
      grid-row: auto;
    }
  `,
}));

const openExternal = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const DownloadsPage = memo(() => {
  const { t } = useTranslation('setting');
  const { message } = App.useApp();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <header className={styles.pageHeader}>
          <Text as="h1" className={styles.pageTitle} weight={700}>
            {t('downloads.title')}
          </Text>
        </header>

        <div className={cx(styles.bentoGrid, isDesktop && styles.desktopBentoGrid)}>
          <Block className={cx(styles.card, styles.mobileCard)}>
            <Flexbox gap={18} height="100%">
              <Flexbox align="center" className={styles.iconBox} justify="center">
                <Icon icon={Smartphone} size={22} />
              </Flexbox>
              <Flexbox gap={8}>
                <Text as="h2" style={{ fontSize: 20 }} weight={700}>
                  {t('downloads.mobile.title')}
                </Text>
                <Text type="secondary">{t('downloads.mobile.desc')}</Text>
              </Flexbox>
              <Flexbox horizontal align="center" className={styles.actionRow} gap={10}>
                <Button
                  type="primary"
                  onClick={() => message.info(t('downloads.mobile.upcomingTip'))}
                >
                  {t('downloads.mobile.cta')}
                </Button>
                <span aria-hidden className={styles.mobilePlatformIcons}>
                  <ApplePlatformIcon size={16} />
                  <AndroidPlatformIcon size={14} />
                </span>
              </Flexbox>
            </Flexbox>
          </Block>

          {!isDesktop && (
            <Block className={cx(styles.card, styles.desktopCard)}>
              <Flexbox gap={18} height="100%">
                <Flexbox align="center" className={styles.iconBox} justify="center">
                  <Icon icon={Monitor} size={22} />
                </Flexbox>
                <Flexbox gap={8}>
                  <Text as="h2" style={{ fontSize: 20 }} weight={700}>
                    {t('downloads.desktop.title')}
                  </Text>
                  <Text type="secondary">{t('downloads.desktop.desc')}</Text>
                </Flexbox>
                <Flexbox horizontal className={styles.actionRow} gap={10}>
                  <Button icon={Download} onClick={() => openExternal(DOWNLOAD_URL.default)}>
                    {t('downloads.desktop.cta')}
                  </Button>
                </Flexbox>
              </Flexbox>
            </Block>
          )}
        </div>
      </main>
    </div>
  );
});

DownloadsPage.displayName = 'DownloadsPage';

export default DownloadsPage;
