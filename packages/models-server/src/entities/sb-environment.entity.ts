import {
  IEdfiTenant,
  IIntegrationApp,
  IOwnership,
  ISbEnvironment,
  SbEnvironmentConfigPrivate,
  SbEnvironmentConfigPublic,
} from '@edanalytics/models';
import { Column, Entity, OneToMany } from 'typeorm';
import { JSONEncryptionTransformer } from 'typeorm-encrypted';
import { EntityBase } from '../utils/entity-base';
import * as config from 'config';

@Entity()
export class SbEnvironment extends EntityBase implements ISbEnvironment {
  @OneToMany('Ownership', (ownership: IOwnership) => ownership.sbEnvironment)
  ownerships: IOwnership[];

  @OneToMany('EdfiTenant', (edfiTenant: IEdfiTenant) => edfiTenant.sbEnvironment)
  edfiTenants: IEdfiTenant[];

  @OneToMany('IntegrationApp', (integrationApp: IIntegrationApp) => integrationApp.sbEnvironment)
  integrationApps: IIntegrationApp[];

  @Column({ nullable: true })
  envLabel: string | null;

  @Column()
  name: string;

  @Column({ type: config.DB_ENGINE === 'pgsql' ? 'jsonb' : 'simple-json', nullable: true })
  configPublic: SbEnvironmentConfigPublic | null;

  get version() {
    return this.configPublic && 'version' in this.configPublic
      ? this.configPublic.version
      : undefined;
  }

  get domain() {
    let host =
      this.configPublic && 'values' in this.configPublic && this.configPublic.values
        ? 'edfiHostname' in this.configPublic.values
          ? this.configPublic.values.edfiHostname
          : this.configPublic.values.meta?.domainName
        : undefined;
    if (host && !(host.startsWith('http://') || host.startsWith('https://'))) {
      host = `https://${host}`;
    }
    return host;
  }

  get usableDomain() {
    return this.domain?.replace(/(https?:\/\/)/, '$1sbaa.');
  }

  get odsApiVersion() {
    return this.configPublic?.odsApiMeta?.version;
  }

  get odsDsVersion() {
    return this.configPublic?.odsApiMeta?.dataModels?.find((dm) => dm.name === 'Ed-Fi')?.version;
  }

  get adminApiUrl() {
    const configPublic = this.configPublic;
    if (configPublic?.adminApiUrl) {
      return new URL(configPublic.adminApiUrl).toString();
    } else {
      return undefined;
    }
  }

  get startingBlocks() {
    return this.configPublic?.startingBlocks ?? false;
  }

  @Column({
    type: config.DB_ENGINE === 'pgsql' ? 'jsonb' : 'simple-json',
    nullable: true,
    transformer: {
      from(value) {
        if ('DB_SECRETS_ENCRYPTION' in global) {
          return new JSONEncryptionTransformer({
            key: DB_SECRETS_ENCRYPTION.KEY,
            algorithm: 'aes-256-cbc',
            // TODO we're using this instead of fixed IV. Refactor secret to just have single string. Tags: encryption, iv, initialization vector
            ivLength: 16,
          }).from(value);
        } else {
          throw new Error('DB_SECRETS_ENCRYPTION not defined');
        }
      },
      to(value) {
        if ('DB_SECRETS_ENCRYPTION' in global) {
          return new JSONEncryptionTransformer({
            key: DB_SECRETS_ENCRYPTION.KEY,
            algorithm: 'aes-256-cbc',
            ivLength: 16,
          }).to(value);
        } else {
          throw new Error('DB_SECRETS_ENCRYPTION not defined');
        }
      },
    },
  })
  configPrivate: SbEnvironmentConfigPrivate | null;

  get displayName() {
    return this.name ?? this.envLabel;
  }
}
