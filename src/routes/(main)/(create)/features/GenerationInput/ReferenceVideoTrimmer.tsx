'use client';

import { Flexbox } from '@lobehub/ui';
import { InputNumber } from '@lobehub/ui/base-ui';
import { Button, Modal } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { ScissorsLine } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css }) => ({
  player: css`
    width: 100%;
    max-height: 320px;
    background: #000;
    border-radius: 8px;
  `,
  timeline: css`
    height: 8px;
    width: 100%;
    border-radius: 4px;
    background: ${cssVar.colorFillSecondary};
    position: relative;
  `,
  window: css`
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 4px;
    background: ${cssVar.colorPrimaryBg};
    border: 1px solid ${cssVar.colorPrimary};
    cursor: grab;
  `,
}));

interface ReferenceVideoTrimmerProps {
  /** 模型支持的最大生成时长(秒),参考视频窗口不超过此值 */
  maxDuration: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
  /** 原始 File(本地,含 objectURL) */
  sourceFile: File;
  sourceUrl: string;
}

/**
 * 参考视频切割器:
 * 模型生成的视频有最大时长(如 wan3.0 30s / Seedance 15s),更长的参考视频
 * 需截取有效片段。这里用「播放头区间 + MediaRecorder 实时重录」实现纯浏览器
 * 裁剪:video 元素播放选定窗口,捕获其轨道写入 MediaRecorder,产物即裁剪后
 * 的 webm/mp4 片段,无需服务端 ffmpeg。
 */
const ReferenceVideoTrimmer = memo<ReferenceVideoTrimmerProps>(
  ({ sourceFile, sourceUrl, maxDuration, onConfirm, onCancel }) => {
    const { t } = useTranslation('video');
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoDuration, setVideoDuration] = useState(0);
    const [clipStart, setClipStart] = useState(0);
    const [clipLength, setClipLength] = useState(Math.min(maxDuration, 5));
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const onMeta = () => {
        const d = Number.isFinite(v.duration) ? v.duration : 0;
        setVideoDuration(d);
        setClipLength(Math.min(maxDuration, d || maxDuration, 5) || Math.min(maxDuration, 5));
      };
      v.addEventListener('loadedmetadata', onMeta);
      return () => v.removeEventListener('loadedmetadata', onMeta);
    }, [sourceUrl, maxDuration]);

    const clampedLength = Math.min(clipLength, videoDuration || maxDuration, maxDuration);
    const clampedStart = Math.min(clipStart, Math.max(0, (videoDuration || 0) - clampedLength));

    const seekPreview = useCallback((time: number) => {
      const v = videoRef.current;
      if (v) v.currentTime = time;
    }, []);

    const handleExport = useCallback(async () => {
      const v = videoRef.current;
      if (!v) return;
      setIsExporting(true);
      setProgress(0);

      try {
        const stream = (
          v as HTMLVideoElement & { captureStream?: () => MediaStream }
        ).captureStream?.();
        if (!stream) throw new Error('captureStream unsupported');

        const mimeCandidates = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
        const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const done = new Promise<Blob>((resolve) => {
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        });

        // 定点播放选定窗口,录制实时进行(长度=窗口长度,快进不适用)
        v.currentTime = clampedStart;
        v.muted = true;
        await v.play();
        recorder.start(200);

        const total = clampedLength * 1000;
        const startedAt = Date.now();
        const timer = setInterval(() => {
          setProgress(Math.min(99, ((Date.now() - startedAt) / total) * 100));
        }, 200);

        await new Promise<void>((resolve) => {
          const check = () => {
            if (v.currentTime >= clampedStart + clampedLength || v.ended) {
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        });

        recorder.stop();
        v.pause();
        clearInterval(timer);
        setProgress(100);

        const blob = await done;
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const base = sourceFile.name.replace(/\.[^.]+$/, '');
        onConfirm(
          new File([blob], `${base}_clip_${Math.round(clampedLength)}s.${ext}`, {
            type: blob.type,
          }),
        );
      } finally {
        setIsExporting(false);
      }
    }, [clampedStart, clampedLength, onConfirm, sourceFile.name]);

    const windowLeft = videoDuration ? (clampedStart / videoDuration) * 100 : 0;
    const windowWidth = videoDuration ? (clampedLength / videoDuration) * 100 : 100;

    return (
      <Modal
        cancelText={t('trimmer.cancel', { defaultValue: '取消' })}
        confirmLoading={isExporting}
        okText={
          isExporting
            ? t('trimmer.exporting', {
                defaultValue: '导出中 {{progress}}%',
                progress: Math.round(progress),
              })
            : t('trimmer.confirm', { defaultValue: '裁剪并使用' })
        }
        onCancel={onCancel}
        onOk={handleExport}
        open
        title={
          <Flexbox align="center" gap={4} horizontal>
            <ScissorsLine size={16} />
            {t('trimmer.title', { defaultValue: '参考视频切割' })}
          </Flexbox>
        }
        width={560}
      >
        <Flexbox gap={12}>
          <video className={styles.player} controls key={sourceUrl} ref={videoRef} src={sourceUrl} />

          <div className={styles.timeline}>
            <div
              className={styles.window}
              style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }}
            />
          </div>

          <Flexbox align="center" gap={8} horizontal>
            <span style={{ fontSize: 12, color: cssVar.colorTextSecondary }}>
              {t('trimmer.start', { defaultValue: '起点(秒)' })}
            </span>
            <InputNumber
              disabled={isExporting}
              max={Math.max(0, (videoDuration || maxDuration) - 1)}
              min={0}
              size="small"
              value={clampedStart}
              onChange={(v) => {
                const s = Math.max(0, Number(v) || 0);
                setClipStart(s);
                seekPreview(s);
              }}
            />
            <span style={{ fontSize: 12, color: cssVar.colorTextSecondary }}>
              {t('trimmer.length', { defaultValue: '片段时长(秒)' })}
            </span>
            <InputNumber
              disabled={isExporting}
              max={maxDuration}
              min={1}
              size="small"
              value={clampedLength}
              onChange={(v) => setClipLength(Math.max(1, Number(v) || 1))}
            />
          </Flexbox>

          <div style={{ fontSize: 12, color: cssVar.colorTextTertiary }}>
            {t('trimmer.hint', {
              defaultValue:
                '模型最长生成 {{max}}s 视频,参考视频将截取选定片段。导出为实时播放速度,窗口越长等待越久。',
              max: maxDuration,
            })}
          </div>
        </Flexbox>
      </Modal>
    );
  },
);

ReferenceVideoTrimmer.displayName = 'ReferenceVideoTrimmer';

export default ReferenceVideoTrimmer;
