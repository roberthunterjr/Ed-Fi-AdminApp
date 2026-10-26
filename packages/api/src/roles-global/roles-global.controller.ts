import {
  GetSessionDataDto,
  PostRoleDto,
  PutRoleDto,
  RoleType,
  toGetRoleDto,
} from '@edanalytics/models';
import { Role, addUserCreating, addUserModifying } from '@edanalytics/models-server';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Authorize, CheckAbility, CheckAbilityType } from '../auth/authorization';
import { ReqUser } from '../auth/helpers/user.decorator';
import { throwNotFound } from '../utils';
import { ValidationHttpException } from '../utils/customExceptions';
import { RolesGlobalService } from './roles-global.service';

@ApiTags('Role - Global')
@Controller()
export class RolesGlobalController {
  constructor(
    private readonly roleService: RolesGlobalService,
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>
  ) {}

  @Post()
  @Authorize({
    privilege: 'role:create',
    subject: {
      id: '__filtered__',
    },
  })
  async create(@Body() createRoleDto: PostRoleDto, @ReqUser() user: GetSessionDataDto) {
    if (
      createRoleDto.type === RoleType.UserGlobal &&
      !createRoleDto.privilegeIds.includes('me:read')
    ) {
      throw new ValidationHttpException({
        field: 'privileges',
        message: 'Minimum privileges not present (me:read).',
      });
    }
    return toGetRoleDto(
      await this.roleService.create(addUserCreating(createRoleDto, user), user.id)
    );
  }

  @Get()
  @Authorize({
    privilege: 'role:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findAll() {
    return toGetRoleDto(await this.rolesRepository.find());
  }

  @Get(':roleId')
  @Authorize({
    privilege: 'role:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findOne(@Param('roleId', new ParseIntPipe()) roleId: number) {
    return toGetRoleDto(await this.roleService.findOne(roleId).catch(throwNotFound));
  }

  @Put(':roleId')
  @Authorize({
    privilege: 'role:update',
    subject: {
      id: '__filtered__',
    },
  })
  async update(
    @Param('roleId', new ParseIntPipe()) roleId: number,
    @Body() updateRoleDto: PutRoleDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    const existing = await this.rolesRepository
      .findOneByOrFail({ id: roleId })
      .catch(throwNotFound);
    if (existing.type === RoleType.UserGlobal && !updateRoleDto.privilegeIds.includes('me:read')) {
      throw new ValidationHttpException({
        field: 'privileges',
        message: 'Minimum privileges not present (me:read).',
      });
    }

    return toGetRoleDto(
      await this.roleService.update(roleId, addUserModifying(updateRoleDto, user), user.id)
    );
  }

  @Delete(':roleId')
  @AuditDelete(Role, 'roleId')
  @Authorize({
    privilege: 'role:delete',
    subject: {
      id: '__filtered__',
    },
  })
  async remove(
    @Param('roleId', new ParseIntPipe()) roleId: number,
    @Query('force', new ParseBoolPipe({ optional: true })) force: boolean | undefined,
    @ReqUser() user: GetSessionDataDto,
    @CheckAbility() checkAbility: CheckAbilityType
  ) {
    return this.roleService.remove(roleId, user, !!force, checkAbility);
  }
}
