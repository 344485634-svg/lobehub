import { Form } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import type { BusinessSignupFomData } from '@/business/client/hooks/useBusinessSignup';
import { useBusinessSignup } from '@/business/client/hooks/useBusinessSignup';
import { message } from '@/components/AntdStaticMethods';
import type { AuthFetchOptions } from '@/features/Auth/utils/authFetchOptions';
import { withCaptchaToken } from '@/features/Auth/utils/authFetchOptions';
import { useAuthServerConfigStore } from '@/features/AuthShell';
import { trackLoginOrSignupClicked } from '@/features/User/UserLoginOrSignup/trackLoginOrSignupClicked';
import { signUp } from '@/libs/better-auth/auth-client';
import { buildOnboardingRedirectUrl } from '@/utils/onboardingRedirect';

import type { BaseSignUpFormValues } from './types';

export type SignUpFormValues = BaseSignUpFormValues & BusinessSignupFomData;

interface SignUpErrorLike {
  code?: string;
  details?: {
    cause?: {
      code?: string;
    };
  };
  message?: string;
}

export const useSignUp = () => {
  const { t } = useTranslation(['auth', 'authError']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<SignUpFormValues>();
  const [loading, setLoading] = useState(false);
  const { getCaptchaTokenOnError, getFetchOptions, preSocialSignupCheck, businessElement } =
    useBusinessSignup(form);
  const enableEmailVerification = useAuthServerConfigStore(
    (s) => s.serverConfig.enableEmailVerification || false,
  );
  const enableBusinessFeatures = useAuthServerConfigStore(
    (s) => s.serverConfig.enableBusinessFeatures || false,
  );

  const handleSignUp = async (values: SignUpFormValues) => {
    setLoading(true);
    await trackLoginOrSignupClicked({ spm: 'signup.submit.click' });

    try {
      if (enableBusinessFeatures && !(await preSocialSignupCheck(values))) {
        setLoading(false);
        return;
      }

      const callbackUrl = searchParams.get('callbackUrl') || '/';
      const redirectUrl = buildOnboardingRedirectUrl(callbackUrl);
      const username = values.email.split('@')[0];
      const fetchOptions = await getFetchOptions();
      // Read invite code from URL (e.g. /signup?ref=ABCD1234)
      const refCode = searchParams.get('ref') || searchParams.get('referral');

      const submit = async (nextFetchOptions?: AuthFetchOptions) =>
        signUp.email({
          callbackURL: redirectUrl,
          email: values.email,
          fetchOptions: nextFetchOptions,
          name: username,
          password: values.password,
        });

      let { error } = await submit(fetchOptions);

      if (error) {
        const captchaToken = await getCaptchaTokenOnError(error);
        if (captchaToken === null) return;
        if (captchaToken) {
          ({ error } = await submit(withCaptchaToken(fetchOptions, captchaToken)));
        }
      }

      if (error) {
        const signUpError = error as SignUpErrorLike;
        const isEmailDuplicate =
          signUpError.code === 'FAILED_TO_CREATE_USER' &&
          signUpError.details?.cause?.code === '23505';

        if (isEmailDuplicate) {
          message.error(t('betterAuth.errors.emailExists'));
          return;
        }

        if (signUpError.code === 'INVALID_EMAIL' || signUpError.message === 'Invalid email') {
          message.error(t('betterAuth.errors.emailInvalid'));
          return;
        }

        const translated = signUpError.code
          ? t(`authError:codes.${signUpError.code}`, { defaultValue: '' })
          : '';
        message.error(translated || signUpError.message || t('betterAuth.signup.error'));
        return;
      }

      // Signup succeeded — bind invite code if present in URL.
      // Uses a plain fetch to a webapi route (not lambdaClient/tRPC) because the
      // auth SPA bundle doesn't include the main app's tRPC chunks; importing
      // lambdaClient here would 404 on chunk load and trigger an infinite
      // reload loop via notifyChunkError().
      if (refCode) {
        try {
          await fetch('/webapi/referral/bind', {
            body: JSON.stringify({ code: refCode }),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });
        } catch {
          // Non-fatal: bind failure should not block registration completion
        }
      }

      if (enableEmailVerification) {
        navigate(
          `/verify-email?email=${encodeURIComponent(values.email)}&callbackUrl=${encodeURIComponent(redirectUrl)}`,
        );
      } else {
        window.location.href = redirectUrl;
      }
    } catch {
      message.error(t('betterAuth.signup.error'));
    } finally {
      setLoading(false);
    }
  };

  return { businessElement, form, loading, onSubmit: handleSignUp };
};
