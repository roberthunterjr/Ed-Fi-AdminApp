import { PostSbEnvironmentDto, resolveOdsApiUrls } from '@edanalytics/models';
import { EdfiTenant, Ods, SbEnvironment } from '@edanalytics/models-server';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fetchOdsApiMetadata, throwNotFound, ValidationHttpException } from '../utils';

export const CERT_TARGET_MESSAGES = {
  notConfigured: 'This environment has no ODS/API discovery URL, so it cannot be certified.',
  contextRouting:
    "This environment uses context-based routing, which certification doesn't support yet.",
  odsRequired: "Choose the ODS / Data Store you're certifying.",
  untrustedTokenUrl:
    "The Ed-Fi API's token address isn't on the same secure host as this environment, so the credentials weren't sent.",
  untrustedResourceUrl:
    "The Ed-Fi API's data address isn't on the same secure host as this environment, so the token wasn't sent.",
};

/**
 * Discovery-provided URLs receive the secret (token URL) or the token (data URL).
 * Only allow https on the same host (and port) as the discovery document, and never
 * a URL that carries credentials.
 */
export const isTrustedTokenUrl = (tokenUrl: string, discoveryUrl: string): boolean => {
  try {
    const token = new URL(tokenUrl);
    const discovery = new URL(discoveryUrl);
    if (token.username || token.password) return false;
    return token.protocol === 'https:' && token.host === discovery.host;
  } catch {
    return false;
  }
};

export interface CertificationTarget {
  oauthUrl: string;
  resourceBaseUrl: string;
}

/** Resolves where certification traffic goes. URLs never come from the browser (AC-673). */
@Injectable()
export class CertificationTargetService {
  constructor(
    @InjectRepository(Ods)
    private readonly odsRepository: Repository<Ods>,
  ) {}

  async resolve({
    sbEnvironment,
    edfiTenant,
    odsId,
  }: {
    sbEnvironment: SbEnvironment;
    edfiTenant: EdfiTenant;
    odsId?: number | null;
  }): Promise<CertificationTarget> {
    // null means "not chosen", same as omitted (TypeORM would otherwise reject a null where-value).
    if (odsId != null) {
      await this.odsRepository
        .findOneByOrFail({ id: odsId, edfiTenantId: edfiTenant.id })
        .catch(throwNotFound);
    } else if ((await this.odsRepository.countBy({ edfiTenantId: edfiTenant.id })) > 0) {
      // Mirrors the form, which only hides the ODS field when the tenant has none.
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.odsRequired);
    }

    const discoveryUrl = sbEnvironment.domain;
    if (!discoveryUrl) {
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.notConfigured);
    }
    // Re-fetch instead of trusting configPublic.odsApiMeta, which can be stale
    // after the environment's discovery URL is edited (AC-673 §4).
    const discovery = await fetchOdsApiMetadata({
      odsApiDiscoveryUrl: discoveryUrl,
    } as PostSbEnvironmentDto);
    const resolved = resolveOdsApiUrls(discovery?.urls, edfiTenant.name);
    if (resolved.status === 'context-routing') {
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.contextRouting);
    }
    if (resolved.status === 'missing-urls') {
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.notConfigured);
    }
    if (!isTrustedTokenUrl(resolved.oauthUrl, discoveryUrl)) {
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.untrustedTokenUrl);
    }
    if (!isTrustedTokenUrl(resolved.resourceBaseUrl, discoveryUrl)) {
      throw new ValidationHttpException(CERT_TARGET_MESSAGES.untrustedResourceUrl);
    }
    return { oauthUrl: resolved.oauthUrl, resourceBaseUrl: resolved.resourceBaseUrl };
  }
}
