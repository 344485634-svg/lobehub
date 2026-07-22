'use client';

import { isDesktop } from '@lobechat/const';
import { MAX_ONBOARDING_STEPS } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import OnboardingContainer from '@/routes/onboarding/_layout';
import { deriveOnboardingBranchPath } from '@/routes/onboarding/branch';
import ResponseLanguageStep from '@/routes/onboarding/features/ResponseLanguageStep';
import {
  trackOnboardingStepCompleted,
  trackOnboardingStepViewed,
} from '@/services/onboardingMetrics';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';
import { clearStaleOnboardingCallbackUrl, isSafeRedirectPath } from '@/utils/onboardingRedirect';

/**
 * Remap a `currentStep` persisted under the old 5-step classic flow
 * (1=Telemetry, 2=FullName, 3=Interests, 4=Language, 5=ProSettings) onto
 * the current classic flow (1=FullName, 2=Interests, 3=ProSettings,
 * 4=AgentPicker).
 */
const remapLegacyClassicStep = (raw: number): number => {
  if (raw <= 2) return 1;
  if (raw === 3) return 2;
  return MAX_ONBOARDING_STEPS - 1;
};

const COMMON_STEP_TRACKING = {
  1: { flow: 'common', step: 'telemetry', stepIndex: 1 },
  2: { flow: 'common', step: 'response_language', stepIndex: 2 },
} as const;

const appendCallbackUrl = (path: string, searchParams: URLSearchParams): string => {
  const callbackUrl = searchParams.get('callbackUrl');
  if (!callbackUrl || !isSafeRedirectPath(callbackUrl)) return path;

  const params = new URLSearchParams();
  params.set('callbackUrl', callbackUrl);
  return `${path}?${params.toString()}`;
};

const CommonOnboardingPage = memo(() => {
  const isUserStateInit = useUserStore((s) => s.isUserStateInit);
  const commonStepsCompleted = useUserStore(onboardingSelectors.commonStepsCompleted);
  const enableAgentOnboarding = useServerConfigStore((s) => s.featureFlags.enableAgentOnboarding);
  const serverConfigInit = useServerConfigStore((s) => s.serverConfigInit);

  const [searchParams, setSearchParams] = useSearchParams();
  const hasStepParam = searchParams.has('step');
  const viewedStepKeysRef = useRef<Set<string>>(new Set());
  const autoSkippedTelemetryRef = useRef(false);

  // Closed product: permanently disable anonymous telemetry collection.
  useEffect(() => {
    if (!isUserStateInit) return;
    useUserStore.getState().updateGeneralConfig({ telemetry: false });
  }, [isUserStateInit]);

  // One-time legacy migration
  const remappedRef = useRef(false);
  useEffect(() => {
    if (!isUserStateInit || remappedRef.current) return;
    const state = useUserStore.getState();
    const persisted = state.onboarding?.currentStep;
    if (persisted === undefined || state.onboarding?.finishedAt) {
      remappedRef.current = true;
      return;
    }
    const remapped = remapLegacyClassicStep(persisted);
    if (remapped !== persisted) {
      void state.setOnboardingStep(remapped);
    }
    remappedRef.current = true;
  }, [isUserStateInit]);

  useEffect(() => {
    clearStaleOnboardingCallbackUrl(window.location.pathname, window.location.search);
  }, []);

  // Closed product: auto-skip telemetry/privacy step and go straight to language,
  // then finish common prefix so classic flow starts without agent marketplace.
  useEffect(() => {
    if (!isUserStateInit || autoSkippedTelemetryRef.current) return;
    if (commonStepsCompleted && !hasStepParam) return;

    autoSkippedTelemetryRef.current = true;
    trackOnboardingStepViewed(COMMON_STEP_TRACKING[1]);
    trackOnboardingStepCompleted({
      ...COMMON_STEP_TRACKING[1],
      action: 'auto_skip',
      skipped: true,
    });
    trackOnboardingStepViewed(COMMON_STEP_TRACKING[2]);
  }, [commonStepsCompleted, hasStepParam, isUserStateInit]);

  const finishCommon = useCallback(() => {
    if (!viewedStepKeysRef.current.has('response_language_done')) {
      viewedStepKeysRef.current.add('response_language_done');
      trackOnboardingStepCompleted(COMMON_STEP_TRACKING[2]);
    }
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  if (!isUserStateInit) {
    return <Loading debugId="CommonOnboarding/userState" />;
  }

  if (commonStepsCompleted && !hasStepParam) {
    if (!serverConfigInit) {
      return <Loading debugId="CommonOnboarding/serverConfig" />;
    }
    // Force classic branch; never agent marketplace in closed product.
    const branchPath = deriveOnboardingBranchPath({
      enableAgentOnboarding: false,
      isDesktop,
    });
    return <Navigate replace to={appendCallbackUrl(branchPath, searchParams)} />;
  }

  return (
    <OnboardingContainer>
      <Flexbox gap={24} style={{ maxWidth: 600, width: '100%' }}>
        <ResponseLanguageStep onBack={() => undefined} onNext={finishCommon} />
      </Flexbox>
    </OnboardingContainer>
  );
});

CommonOnboardingPage.displayName = 'CommonOnboardingPage';

export default CommonOnboardingPage;
