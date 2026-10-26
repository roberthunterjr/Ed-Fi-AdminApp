// packages/api/src/certification/certification-token.service.ts
import { CertificationTokenDto } from '@edanalytics/models';
import { EdfiTenant, SbEnvironment } from '@edanalytics/models-server';
import { Injectable } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import config from 'config';
import { ValidationHttpException } from '../utils';
import { CERT_TARGET_MESSAGES, CertificationTargetService } from './certification-target.service';

export const CERT_TOKEN_MESSAGES = {
  ...CERT_TARGET_MESSAGES,
  invalidCredentials: 'Key or secret not valid for this tenant.',
  noTokenEndpoint: (oauthUrl: string) => `The Ed-Fi API has no token endpoint at ${oauthUrl}.`,
  unreachable: (oauthUrl: string) => `Couldn't reach the Ed-Fi API at ${oauthUrl}.`,
};

@Injectable()
export class CertificationTokenService {
  constructor(private readonly certificationTargetService: CertificationTargetService) {}

  /**
   * Exchanges the user's key and secret for an ODS/API token (AC-673).
   * The key, secret and token are never stored or logged.
   */
  async requestToken({
    sbEnvironment,
    edfiTenant,
    odsId,
    key,
    secret,
  }: {
    sbEnvironment: SbEnvironment;
    edfiTenant: EdfiTenant;
    odsId?: number;
    key: string;
    secret: string;
  }): Promise<CertificationTokenDto> {
    const { oauthUrl, resourceBaseUrl } = await this.certificationTargetService.resolve({
      sbEnvironment,
      edfiTenant,
      odsId,
    });

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', key);
    body.set('client_secret', secret);

    try {
      const response = await axios.post(oauthUrl, body, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: config.EDFI_URLS_TIMEOUT_MS,
        // Never follow a redirect: the body carries client_secret.
        maxRedirects: 0,
      });
      const { access_token, expires_in } = response.data ?? {};
      if (typeof access_token !== 'string' || typeof expires_in !== 'number') {
        throw new ValidationHttpException(CERT_TOKEN_MESSAGES.unreachable(oauthUrl));
      }
      return {
        token: access_token,
        expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
        oauthUrl,
        resourceBaseUrl,
      };
    } catch (error) {
      // Never log `error`: error.config.data contains client_secret.
      if (error instanceof ValidationHttpException) throw error;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 400 || status === 401) {
        throw new ValidationHttpException(CERT_TOKEN_MESSAGES.invalidCredentials);
      }
      if (status === 404) {
        throw new ValidationHttpException(CERT_TOKEN_MESSAGES.noTokenEndpoint(oauthUrl));
      }
      throw new ValidationHttpException(CERT_TOKEN_MESSAGES.unreachable(oauthUrl));
    }
  }
}
