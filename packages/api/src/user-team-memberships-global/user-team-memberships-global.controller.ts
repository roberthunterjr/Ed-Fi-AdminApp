import {
  GetSessionDataDto,
  PostUserTeamMembershipDto,
  PutUserTeamMembershipDto,
  toGetUserTeamMembershipDto,
} from '@edanalytics/models';
import { UserTeamMembership, addUserCreating, addUserModifying } from '@edanalytics/models-server';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Authorize } from '../auth/authorization';
import { ReqUser } from '../auth/helpers/user.decorator';
import { ValidationHttpException, throwNotFound } from '../utils';
import { UserTeamMembershipsGlobalService } from './user-team-memberships-global.service';

@ApiTags('UserTeamMembership - Global')
@Controller()
export class UserTeamMembershipsGlobalController {
  constructor(
    private readonly userTeamMembershipService: UserTeamMembershipsGlobalService,
    @InjectRepository(UserTeamMembership)
    private userTeamMembershipsRepository: Repository<UserTeamMembership>
  ) {}

  @Post()
  @Authorize({
    privilege: 'user-team-membership:create',
    subject: {
      id: '__filtered__',
    },
  })
  async create(
    @Body() createUserTeamMembershipDto: PostUserTeamMembershipDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    const isRedundant = !!(
      await this.userTeamMembershipsRepository.findBy({
        teamId: createUserTeamMembershipDto.teamId,
        userId: createUserTeamMembershipDto.userId,
      })
    ).length;

    if (isRedundant) {
      throw new ValidationHttpException({
        field: 'teamId',
        message:
          'A membership already exists for this team\u2013user combination. To minimize confusion we disallow duplication.',
      });
    }
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.create(
        addUserCreating(createUserTeamMembershipDto, user),
        user.id
      )
    );
  }

  @Get()
  @Authorize({
    privilege: 'user-team-membership:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findAll() {
    return toGetUserTeamMembershipDto(await this.userTeamMembershipsRepository.find());
  }

  @Get(':userTeamMembershipId')
  @Authorize({
    privilege: 'user-team-membership:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findOne(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number
  ) {
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.findOne(userTeamMembershipId).catch(throwNotFound)
    );
  }

  @Put(':userTeamMembershipId')
  @Authorize({
    privilege: 'user-team-membership:update',
    subject: {
      id: '__filtered__',
    },
  })
  async update(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number,
    @Body() updateUserTeamMembershipDto: PutUserTeamMembershipDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    return toGetUserTeamMembershipDto(
      await this.userTeamMembershipService.update(
        userTeamMembershipId,
        addUserModifying(updateUserTeamMembershipDto, user),
        user.id
      )
    );
  }

  @Delete(':userTeamMembershipId')
  @AuditDelete(UserTeamMembership, 'userTeamMembershipId')
  @Authorize({
    privilege: 'user-team-membership:delete',
    subject: {
      id: '__filtered__',
    },
  })
  remove(
    @Param('userTeamMembershipId', new ParseIntPipe())
    userTeamMembershipId: number,
    @ReqUser() user: GetSessionDataDto
  ) {
    return this.userTeamMembershipService.remove(userTeamMembershipId, user);
  }
}
