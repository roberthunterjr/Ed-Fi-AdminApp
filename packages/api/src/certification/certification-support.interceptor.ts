import { certificationUnsupportedMessage, supportsCertification } from '@edanalytics/models';
import { SbEnvironment } from '@edanalytics/models-server';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { CustomHttpException } from '../utils/customExceptions';

/**
 * Refuses certification requests for environments below the minimum Ed-Fi data model
 * (MIN_CERTIFICATION_DATA_MODEL), or whose data model can't be determined, so a direct URL
 * can't bypass the hidden UI action (AC-677). A 400 with a message, not the 404 the SbVersion
 * gate uses, because the environment exists and the user needs to know what to change.
 * Must run after SbEnvironmentEdfiTenantInterceptor, which puts the environment on the request.
 */
@Injectable()
export class CertificationSupportInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const sbEnvironment: SbEnvironment | undefined = request.sbEnvironment;
    if (!sbEnvironment) {
      // The resolver skips IDs that aren't numbers (same test as below). Interceptors run
      // before pipes, so let ParseIntPipe answer those with its 400.
      const hasNumericId = [request.params?.sbEnvironmentId, request.params?.edfiTenantId].some(
        (id) => Number.isFinite(Number(id)),
      );
      if (!hasNumericId) return next.handle();
      // A numeric ID with no environment means the resolver didn't run first: fail closed.
      throw new Error(
        'CertificationSupportInterceptor must run after SbEnvironmentEdfiTenantInterceptor.',
      );
    }
    if (!supportsCertification(sbEnvironment.odsDsVersion)) {
      throw new CustomHttpException(
        {
          type: 'Error',
          title: 'Certification is not available for this environment.',
          message: certificationUnsupportedMessage(sbEnvironment.odsDsVersion),
        },
        400,
      );
    }
    return next.handle();
  }
}
