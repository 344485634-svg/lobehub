import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  mainContainer: css`
    overflow: hidden auto;
    min-width: 0;
    background: ${cssVar.colorBgLayout};
  `,
  root: css`
    overflow: hidden;
    min-height: 0;
  `,
  sidebar: css`
    overflow: hidden auto;
    flex-shrink: 0;

    width: 220px;
    height: 100%;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  sidebarItem: css`
    color: inherit;
    text-decoration: none;
  `,
  sidebarItemActive: css`
    background: ${cssVar.colorFillTertiary};
  `,
  sidebarItemInner: css`
    border-radius: 8px;
    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));
