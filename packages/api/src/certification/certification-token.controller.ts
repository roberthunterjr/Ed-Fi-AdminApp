import { PostCertificationTokenDto, toCertificationTokenDto } from '@edanalytics/models';
import { EdfiTenant, SbEnvironment } from '@edanalytics/models-server';
import { Body, Controller, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ReqEdfiTenant,
  ReqSbEnvironment,
  SbEnvironmentEdfiTenantInterceptor,
} from '../app/sb-environment-edfi-tenant.interceptor';
import { Authorize } from '../auth/authorization';
import { CertificationSupportInterceptor } from './certification-support.interceptor';
import { CertificationTokenService } from './certification-token.service';

@ApiTags('Certification')
@UseInterceptors(SbEnvironmentEdfiTenantInterceptor, CertificationSupportInterceptor)
@Controller('sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/certification')
export class CertificationTokenController {
  constructor(private readonly certificationTokenService: CertificationTokenService) {}

  @Post('token')
  @HttpCode(200)
  @Authorize({ privilege: 'sb-environment:update', subject: { id: 'sbEnvironmentId' } })
  async requestToken(
    @ReqSbEnvironment() sbEnvironment: SbEnvironment,
    @ReqEdfiTenant() edfiTenant: EdfiTenant,
    @Body() body: PostCertificationTokenDto,
  ) {
    const result = await this.certificationTokenService.requestToken({
      sbEnvironment,
      edfiTenant,
      odsId: body.odsId,
      key: body.key,
      secret: body.secret,
    });
    return toCertificationTokenDto(result);
  }
}
