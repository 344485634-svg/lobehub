import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  mainContainer: css`
    position: relative;
    overflow: hidden;
    background: ${cssVar.colorBgContainer};
  `,
  /* 移动端:内容 fullWidth 占满屏宽后,白色容器与页面灰底(colorBgLayout)
     在滚动过界/回弹时形成割裂。统一为页面背景色,视觉全屏一致。
     由组件按 useIsMobile 切换(与 fullWidth 同一判定,避免断点不同步)。 */
  mainContainerMobile: css`
    background: ${cssVar.colorBgLayout};
  `,
}));
