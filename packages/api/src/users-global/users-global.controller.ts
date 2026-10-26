import { GetSessionDataDto, PostUserDto, PutUserDto, toGetUserDto } from '@edanalytics/models';
import { User, addUserCreating, addUserModifying } from '@edanalytics/models-server';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Authorize } from '../auth/authorization';
import { ReqUser } from '../auth/helpers/user.decorator';
import { ValidationHttpException, throwNotFound } from '../utils';
import { UsersGlobalService } from './users-global.service';

@ApiTags('User - Global')
@Controller()
export class UsersGlobalController {
  constructor(
    private readonly userService: UsersGlobalService,
    @InjectRepository(User)
    private usersRepository: Repository<User>
  ) {}

  @Post()
  @Authorize({
    privilege: 'user:create',
    subject: {
      id: '__filtered__',
    },
  })
  async create(@Body() createUserDto: PostUserDto, @ReqUser() user: GetSessionDataDto) {
    if (createUserDto.userType === 'machine' && !createUserDto.clientId) {
      throw new ValidationHttpException({
        field: 'clientId',
        message: 'Client ID is required for machine users',
      });
    } else if (createUserDto.userType === 'human' && createUserDto.clientId) {
      throw new ValidationHttpException({
        field: 'clientId',
        message: 'Client ID is not allowed for human users',
      });
    }
    if (createUserDto.userType === 'machine' && !createUserDto.description) {
      throw new ValidationHttpException({
        field: 'description',
        message: 'Description is required for machine users',
      });
    } else if (createUserDto.userType === 'human' && createUserDto.description) {
      throw new ValidationHttpException({
        field: 'description',
        message: 'Description is not allowed for human users',
      });
    }

    try {
      return toGetUserDto(
        await this.userService.create(addUserCreating(createUserDto, user), user.id)
      );
    } catch (error) {
      if (error?.code === '23505') {
        if (error.detail?.includes('clientId')) {
          throw new ValidationHttpException({
            field: 'clientId',
            message: 'Client ID already exists',
          });
        }
        if (error.detail?.includes('username')) {
          throw new ValidationHttpException({
            field: 'username',
            message: 'Username already exists',
          });
        }
      }
      throw error;
    }
  }

  @Get()
  @Authorize({
    privilege: 'user:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findAll() {
    return toGetUserDto(await this.usersRepository.find());
  }

  @Get(':userId')
  @Authorize({
    privilege: 'user:read',
    subject: {
      id: '__filtered__',
    },
  })
  async findOne(@Param('userId', new ParseIntPipe()) userId: number) {
    return toGetUserDto(await this.userService.findOne(userId).catch(throwNotFound));
  }

  @Put(':userId')
  @Authorize({
    privilege: 'user:update',
    subject: {
      id: '__filtered__',
    },
  })
  async update(
    @Param('userId', new ParseIntPipe()) userId: number,
    @Body() updateUserDto: PutUserDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    try {
      return toGetUserDto(
        await this.userService.update(userId, addUserModifying(updateUserDto, user), user.id)
      );
    } catch (error) {
      if (error?.code === '23505') {
        throw new ValidationHttpException({
          field: 'username',
          message: 'Username already exists',
        });
      }
      throw error;
    }
  }

  @Delete(':userId')
  @AuditDelete(User, 'userId')
  @Authorize({
    privilege: 'user:delete',
    subject: {
      id: '__filtered__',
    },
  })
  remove(@Param('userId', new ParseIntPipe()) userId: number, @ReqUser() user: GetSessionDataDto) {
    return this.userService.remove(userId, user);
  }
}
