import { Expose, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TrimWhitespace } from '../utils';
import { makeSerializer } from '../utils/make-serializer';

/** Body of POST .../edfi-tenants/:edfiTenantId/certification/token. Never persisted or logged. */
export class PostCertificationTokenDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  odsId?: number;

  @Expose()
  @TrimWhitespace()
  @IsString()
  @IsNotEmpty()
  key: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  secret: string;
}

export class CertificationTokenDto {
  @Expose()
  token: string;

  /** ISO 8601 instant when the ODS/API token expires. */
  @Expose()
  expiresAt: string;

  @Expose()
  oauthUrl: string;

  @Expose()
  resourceBaseUrl: string;
}

export const toCertificationTokenDto = makeSerializer<CertificationTokenDto, CertificationTokenDto>(
  CertificationTokenDto,
);
