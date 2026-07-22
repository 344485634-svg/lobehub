'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import { useIsMobile } from '@/hooks/useIsMobile';
import OnboardingContainer from '@/routes/onboarding/_layout';
import FullNameStep from '@/routes/onboarding/features/FullNameStep';
import InterestsStep from '@/routes/onboarding/features/InterestsStep';
import {
  trackOnboardingCompleted,
  trackOnboardingStepCompleted,
  trackOnboardingStepViewed,
} from '@/services/onboardingMetrics';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';
import { consumeOnboardingCallbackUrl } from '@/utils/onboardingRedirect';

const INTERESTS_STEP = 2;

const CLASSIC_STEP_TRACKING = {
  1: { flow: 'classic', step: 'fullname', stepIndex: 1 },
  [INTERESTS_STEP]: { flow: 'classic', step: 'interests', stepIndex: 2 },
} as const;

/**
 * Closed-product classic onboarding:
 * FullName → Interests → finish (no AgentPicker marketplace page).
 */
const ClassicOnboardingPage = memo(() => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [
    isUserStateInit,
    commonStepsCompleted,
    currentStep,
    goToNextStep,
    goToPreviousStep,
    finishOnboarding,
  ] = useUserStore((s) => [
    s.isUserStateInit,
    onboardingSelectors.commonStepsCompleted(s),
    onboardingSelectors.currentStep(s),
    s.goToNextStep,
    s.goToPreviousStep,
    s.finishOnboarding,
  ]);
  const viewedStepKeysRef = useRef<Set<string>>(new Set());
  const finishingRef = useRef(false);

  const backToResponseLanguageStep = useCallback(() => {
    navigate('/onboarding', { replace: true });
  }, [navigate]);

  const finishOnboardingAndLeave = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await finishOnboarding();
      trackOnboardingCompleted({ flow: 'classic' });
      navigate(consumeOnboardingCallbackUrl() || '/', { replace: true });
    } finally {
      finishingRef.current = false;
    }
  }, [finishOnboarding, navigate]);

  // If user lands on old steps (prosettings/agentpicker), finish immediately.
  useEffect(() => {
    if (!isUserStateInit || !commonStepsCompleted) return;
    if (currentStep > INTERESTS_STEP) {
      void finishOnboardingAndLeave();
    }
  }, [commonStepsCompleted, currentStep, finishOnboardingAndLeave, isUserStateInit]);

  useEffect(() => {
    if (!isUserStateInit || !commonStepsCompleted) return;
    if (currentStep > INTERESTS_STEP) return;
    const payload = CLASSIC_STEP_TRACKING[currentStep as keyof typeof CLASSIC_STEP_TRACKING];
    if (!payload || viewedStepKeysRef.current.has(payload.step)) return;
    viewedStepKeysRef.current.add(payload.step);
    trackOnboardingStepViewed(payload);
  }, [commonStepsCompleted, currentStep, isUserStateInit]);

  const goToNextStepFromFullName = useCallback(() => {
    trackOnboardingStepCompleted(CLASSIC_STEP_TRACKING[1]);
    goToNextStep();
  }, [goToNextStep]);

  const goToNextStepFromInterests = useCallback(() => {
    trackOnboardingStepCompleted(CLASSIC_STEP_TRACKING[INTERESTS_STEP]);
    void finishOnboardingAndLeave();
  }, [finishOnboardingAndLeave]);

  if (!isUserStateInit) {
    return <Loading debugId="ClassicOnboarding" />;
  }

  if (!commonStepsCompleted) {
    return <Navigate replace to="/onboarding" />;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1: {
        return (
          <FullNameStep onBack={backToResponseLanguageStep} onNext={goToNextStepFromFullName} />
        );
      }
      case INTERESTS_STEP:
      default: {
        // Any later legacy step also treated as interests completion path
        if (currentStep > INTERESTS_STEP) {
          return <Loading debugId="ClassicOnboarding/finishing" />;
        }
        return <InterestsStep onBack={goToPreviousStep} onNext={goToNextStepFromInterests} />;
      }
    }
  };

  return (
    <OnboardingContainer>
      <Flexbox gap={24} paddingInline={isMobile ? 16 : 0} style={{ maxWidth: 600, width: '100%' }}>
        {renderStep()}
      </Flexbox>
    </OnboardingContainer>
  );
});

ClassicOnboardingPage.displayName = 'ClassicOnboardingPage';

export default ClassicOnboardingPage;
