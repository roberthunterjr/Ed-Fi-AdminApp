import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsUUID } from 'class-validator';
import axios from 'axios';
import config from 'config';
import type { Response } from 'express';
import { Public } from '../auth/authorization/public.decorator';
import { Throttle } from '@nestjs/throttler';

class SecretIdDto {
  // @Expose() is required: the global pipe strips unexposed properties (AC-642).
  @Expose()
  @IsUUID(4, { message: 'secretId must be a valid UUID' })
  secretId: string;
}
import { HealthStatus, HealthService } from './health.service';
import { describeHealthError, getHealthFailureMessage } from './health-error';

@ApiTags('App')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('healthcheck')
  @ApiOkResponse({ description: 'The API and its configured database are healthy.' })
  @ApiServiceUnavailableResponse({
    description: 'The database probe failed or timed out, or the healthcheck encountered an error.',
  })
  async healthcheck(@Res({ passthrough: true }) response: Response): Promise<HealthStatus> {
    let health: HealthStatus;
    try {
      this.logger.debug('Healthcheck endpoint called');
      health = await this.healthService.getHealth();
    } catch (error) {
      this.logger.error(`Healthcheck error: ${describeHealthError(error)}`);

      health = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          api: {
            status: 'healthy',
            message: 'API is responding',
          },
          database: {
            status: 'unhealthy',
            message: getHealthFailureMessage(error),
          },
        },
      };
    }
    response.status(health.status === 'healthy' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }

  // Override default configuration for Rate limiting and duration.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('secret/:secretId/')
  secret(@Param() params: SecretIdDto) {
    const yopassUrl = new URL(`/secret/${encodeURIComponent(params.secretId)}`, config.YOPASS_URL);

    return axios
      .get(yopassUrl.toString())
      .then((res) => {
        return res.data;
      })
      .catch((err) => {
        Logger.warn(err);
        throw new NotFoundException('Secret not found.');
      });
  }
}
