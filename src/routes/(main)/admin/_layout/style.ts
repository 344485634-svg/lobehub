import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  mainContainer: css`
    overflow: hidden auto;
    background: ${cssVar.colorBgLayout};
  `,
}));
