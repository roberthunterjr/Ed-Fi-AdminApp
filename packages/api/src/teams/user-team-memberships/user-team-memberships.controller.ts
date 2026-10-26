import {
  GetSessionDataDto,
  PostUserTeamMembershipDto,
  PutUserTeamMembershipDto,
  toGetUserTeamMembershipDto,
} from '@edanalytics/models';
import { AuditDelete } from '../../audit/audit-delete.decorator';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ReqUser } from '../../auth/helpers/user.decorator';
import { UserTeamMembershipsService as UserTeamMembershipsService } from './user-team-memberships.service';
import { ApiTags } from '@nestjs/swagger';
import {
  UserTeamMembership,
  addUserCreating,
  addUserModifying,
} from '@edanalytics/models-server';
import { Authorize } from '../../auth/authorization';

@ApiTags('UserTeamMembership')
@Controller()
export class UserTeamMembershipsController {
  constructor(private readonly userTeamMembershipService: UserTeamMembershipsService) {}

  @Post()
  @Authorize({
    privilege: 'team.user-team-membership:create',
    subject: {
      id: '__filtered__',
      teamId: 'teamId',
    },
  })
  async create(
    @Body() createUserTeamMembershipDto: PostUserTeamMembershipDto,
    @ReqUser() session: GetSessionDataDto,
    @Param('teamId', new ParseIntPipe()) teamId: number
  ) {
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.create(
        addUserCreating({ ...createUserTeamMembershipDto, teamId }, session),
        session.id
      )
    );
  }

  @Get()
  @Authorize({
    privilege: 'team.user-team-membership:read',
    subject: {
      id: '__filtered__',
      teamId: 'teamId',
    },
  })
  async findAll(@Param('teamId', new ParseIntPipe()) teamId: number) {
    return toGetUserTeamMembershipDto(await this.userTeamMembershipService.findAll(teamId));
  }

  @Get(':userTeamMembershipId')
  @Authorize({
    privilege: 'team.user-team-membership:read',
    subject: {
      id: 'userTeamMembershipId',
      teamId: 'teamId',
    },
  })
  async findOne(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number,
    @Param('teamId', new ParseIntPipe()) teamId: number
  ) {
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.findOne(teamId, +userTeamMembershipId)
    );
  }

  @Put(':userTeamMembershipId')
  @Authorize({
    privilege: 'team.user-team-membership:update',
    subject: {
      id: 'userTeamMembershipId',
      teamId: 'teamId',
    },
  })
  async update(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number,
    @Param('teamId', new ParseIntPipe()) teamId: number,
    @Body() updateUserTeamMembershipDto: PutUserTeamMembershipDto,
    @ReqUser() session: GetSessionDataDto
  ) {
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.update(
        teamId,
        userTeamMembershipId,
        addUserModifying({ ...updateUserTeamMembershipDto, teamId }, session),
        session.id
      )
    );
  }

  @Delete(':userTeamMembershipId')
  @AuditDelete(UserTeamMembership, 'userTeamMembershipId')
  @Authorize({
    privilege: 'team.user-team-membership:delete',
    subject: {
      id: 'userTeamMembershipId',
      teamId: 'teamId',
    },
  })
  remove(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number,
    @Param('teamId', new ParseIntPipe()) teamId: number,
    @ReqUser() session: GetSessionDataDto
  ) {
    return this.userTeamMembershipService.remove(teamId, +userTeamMembershipId, session);
  }
}
