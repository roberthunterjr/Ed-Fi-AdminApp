import { Expose } from 'class-transformer';
import { IEnvNav } from '../interfaces';
import { makeSerializer } from '../utils';

// This is a Get DTO that should not have whitespace trimmed
export class EnvNavDto implements IEnvNav {
  @Expose()
  sbEnvironmentId: number;
  @Expose()
  sbEnvironmentName: string;
  @Expose()
  edfiTenantId: null | number;
  @Expose()
  edfiTenantName: null | string;
  /** Ed-Fi API version of the environment; not part of the env-nav view, added by the API. */
  @Expose()
  version?: 'v1' | 'v2' | 'v3';

  @Expose()
  odss: boolean;
  @Expose()
  edorgs: boolean;
  @Expose()
  vendors: boolean;
  @Expose()
  claimsets: boolean;
  @Expose()
  applications: boolean;
  @Expose()
  profiles: boolean;

  get displayName() {
    return this.sbEnvironmentName;
  }

  get id() {
    return `${this.sbEnvironmentId}-${this.edfiTenantId}`;
  }
}

export const toEnvNavDto = makeSerializer<EnvNavDto, Omit<EnvNavDto, 'displayName' | 'id'>>(
  EnvNavDto,
);
