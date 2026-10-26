import {
  AuthorizationCache,
  GetSessionDataDto,
  PostTeamDto,
  PutTeamDto,
  SbaaAdminApiVersion,
  toEnvNavDto,
  toGetTeamDto,
} from '@edanalytics/models';
import {
  EnvNav,
  SbEnvironment,
  Team,
  addUserCreating,
  addUserModifying,
} from '@edanalytics/models-server';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Authorize } from '../auth/authorization';
import { AuthCache } from '../auth/helpers/inject-auth-cache';
import { ReqUser } from '../auth/helpers/user.decorator';
import { throwNotFound } from '../utils';
import { TeamsGlobalService } from './teams-global.service';

@ApiTags('Team - Global')
@Controller()
export class TeamsGlobalController {
  constructor(
    private readonly teamService: TeamsGlobalService,
    @InjectRepository(Team)
    private teamsRepository: Repository<Team>,
    @InjectRepository(EnvNav) private readonly envNavRepository: Repository<EnvNav>,
    @InjectRepository(SbEnvironment)
    private readonly sbEnvironmentsRepository: Repository<SbEnvironment>,
  ) {}

  @Post()
  @Authorize({
    privilege: 'team:create',
    subject: {
      id: '__filtered__',
    },
  })
  async create(@Body() createTeamDto: PostTeamDto, @ReqUser() user: GetSessionDataDto) {
    return toGetTeamDto(await this.teamService.create(addUserCreating(createTeamDto, user)));
  }

  @Get()
  @Authorize({
    privilege: 'team:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findAll() {
    return toGetTeamDto(await this.teamsRepository.find());
  }

  @Get(':teamId')
  @Authorize({
    privilege: 'team:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findOne(@Param('teamId', new ParseIntPipe()) teamId: number) {
    return toGetTeamDto(await this.teamService.findOne(teamId).catch(throwNotFound));
  }

  @Put(':teamId')
  @Authorize({
    privilege: 'team:update',
    subject: {
      id: '__filtered__',
    },
  })
  async update(
    @Param('teamId', new ParseIntPipe()) teamId: number,
    @Body() updateTeamDto: PutTeamDto,
    @ReqUser() user: GetSessionDataDto,
  ) {
    return toGetTeamDto(
      await this.teamService.update(teamId, addUserModifying(updateTeamDto, user)),
    );
  }

  @Delete(':teamId')
  @AuditDelete(Team, 'teamId')
  @Authorize({
    privilege: 'team:delete',
    subject: {
      id: '__filtered__',
    },
  })
  remove(@Param('teamId', new ParseIntPipe()) teamId: number, @ReqUser() user: GetSessionDataDto) {
    return this.teamService.remove(teamId, user);
  }

  @Authorize({
    privilege: 'team.sb-environment:read',
    subject: {
      teamId: 'teamId',
      id: '__filtered__',
    },
  })
  @Get(':teamId/env-nav')
  async envNav(@AuthCache() authCache: AuthorizationCache) {
    const sbEnvironmentRead = authCache['team.sb-environment:read'];
    if (sbEnvironmentRead === true) {
      return this.toEnvNavWithVersions(await this.envNavRepository.find(), authCache);
    }
    const edfiTenantRead = authCache['team.sb-environment.edfi-tenant:read'] ?? {};
    return this.toEnvNavWithVersions(
      await this.envNavRepository.find({
        where: [
          {
            sbEnvironmentId: In(
              [...sbEnvironmentRead.values()].filter(
                // environment item should be displaced by its constituent tenant items
                (sbEnvironmentId) => !(sbEnvironmentId in edfiTenantRead),
              ),
            ),
            edfiTenantId: IsNull(),
          },
          ...Object.entries(edfiTenantRead).map(([sbEnvironmentId, edfiTenantIds]) => ({
            sbEnvironmentId: Number(sbEnvironmentId),
            ...(edfiTenantIds === true
              ? { edfiTenantId: Not(IsNull()) }
              : { edfiTenantId: In([...edfiTenantIds.values()]) }),
          })),
        ],
      }),
      authCache,
    );
  }

  /**
   * The env-nav view doesn't carry the Ed-Fi API version, so it's looked up here
   * from the environments' configPublic (lets the UI pick "ODSs" vs "Data Stores").
   */
  private async toEnvNavWithVersions(envNavs: EnvNav[], authCache: AuthorizationCache) {
    const sbEnvironmentIds = [...new Set(envNavs.map((env) => env.sbEnvironmentId))];
    const sbEnvironments = sbEnvironmentIds.length
      ? await this.sbEnvironmentsRepository.find({
          select: { id: true, configPublic: true },
          where: { id: In(sbEnvironmentIds) },
        })
      : [];
    const versions = new Map(
      sbEnvironments.map((sbEnvironment) => [sbEnvironment.id, sbEnvironment.version]),
    );
    return toEnvNavDto(envNavs.map(mapEnvNav(authCache, versions)));
  }
}
const mapEnvNav =
  (authCache: AuthorizationCache, versions: Map<number, SbaaAdminApiVersion | undefined>) =>
  (env: EnvNav) => {
    const version = versions.get(env.sbEnvironmentId);
    if (env.edfiTenantId === null) {
      return {
        ...env,
        version,
        odss: false,
        edorgs: false,
        vendors: false,
        claimsets: false,
        applications: false,
        profiles: false,
      };
    } else {
      return {
        ...env,
        version,
        odss: !!authCache['team.sb-environment.edfi-tenant.ods:read']?.[env.edfiTenantId],
        edorgs: !!authCache['team.sb-environment.edfi-tenant.ods.edorg:read']?.[env.edfiTenantId],
        vendors: !!authCache['team.sb-environment.edfi-tenant.vendor:read']?.[env.edfiTenantId],
        claimsets: !!authCache['team.sb-environment.edfi-tenant.claimset:read']?.[env.edfiTenantId],
        applications:
          !!authCache['team.sb-environment.edfi-tenant.ods.edorg.application:read']?.[
            env.edfiTenantId
          ],
        profiles: !!authCache['team.sb-environment.edfi-tenant.profile:read']?.[env.edfiTenantId],
      };
    }
  };
