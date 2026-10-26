import {
  GetSessionDataDto,
  PostOwnershipDto,
  PutOwnershipDto,
  toGetOwnershipDto,
  toGetOwnershipViewDto,
} from '@edanalytics/models';
import {
  Ownership,
  OwnershipView,
  addUserCreating,
  addUserModifying,
} from '@edanalytics/models-server';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Authorize } from '../auth/authorization';
import { ReqUser } from '../auth/helpers/user.decorator';
import { throwNotFound } from '../utils';
import { OwnershipsGlobalService } from './ownerships-global.service';

@ApiTags('Ownership - Global')
@Controller()
export class OwnershipsGlobalController {
  constructor(
    private readonly ownershipService: OwnershipsGlobalService,
    @InjectRepository(Ownership)
    private ownershipsRepository: Repository<Ownership>,
    @InjectRepository(OwnershipView)
    private ownershipsViewRepository: Repository<OwnershipView>
  ) {}

  @Post()
  @Authorize({
    privilege: 'ownership:create',
    subject: {
      id: '__filtered__',
    },
  })
  async create(@Body() createOwnershipDto: PostOwnershipDto, @ReqUser() user: GetSessionDataDto) {
    return toGetOwnershipDto(
      await this.ownershipService.create(addUserCreating(createOwnershipDto, user))
    );
  }

  @Get()
  @Authorize({
    privilege: 'ownership:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findAll() {
    return toGetOwnershipViewDto(await this.ownershipsViewRepository.find());
  }

  @Get(':ownershipId')
  @Authorize({
    privilege: 'ownership:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findOne(@Param('ownershipId', new ParseIntPipe()) ownershipId: number) {
    return toGetOwnershipDto(await this.ownershipService.findOne(ownershipId).catch(throwNotFound));
  }

  @Put(':ownershipId')
  @Authorize({
    privilege: 'ownership:update',
    subject: {
      id: '__filtered__',
    },
  })
  async update(
    @Param('ownershipId', new ParseIntPipe()) ownershipId: number,
    @Body() updateOwnershipDto: PutOwnershipDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    return toGetOwnershipDto(
      await this.ownershipService.update(ownershipId, addUserModifying(updateOwnershipDto, user))
    );
  }

  @Delete(':ownershipId')
  @AuditDelete(Ownership, 'ownershipId')
  @Authorize({
    privilege: 'ownership:delete',
    subject: {
      id: '__filtered__',
    },
  })
  remove(
    @Param('ownershipId', new ParseIntPipe()) ownershipId: number,
    @ReqUser() user: GetSessionDataDto
  ) {
    return this.ownershipService.remove(ownershipId, user);
  }
}
