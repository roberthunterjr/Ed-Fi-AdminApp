import 'reflect-metadata';
import { EdfiTenant, Edorg, Ods, SbEnvironment } from '@edanalytics/models-server';
import { PostOdsDto } from '@edanalytics/models';
import { Repository } from 'typeorm';
import { OdssService } from './odss.service';
import { StartingBlocksServiceV2 } from '../starting-blocks';
import { OdsRowCountService } from '../starting-blocks/v2/ods-rowcount.service';

const mockOdssRepository = () => ({
  findOneBy: jest.fn(),
  findBy: jest.fn(),
  save: jest.fn(),
});

const mockEdorgsRepository = () => ({
  findBy: jest.fn(),
  save: jest.fn(),
});

describe('OdssService', () => {
  let service: OdssService;
  let odssRepository: ReturnType<typeof mockOdssRepository>;
  let edorgsRepository: ReturnType<typeof mockEdorgsRepository>;
  let startingBlocksServiceV2: Partial<StartingBlocksServiceV2>;

  const mockSbEnvironment: Partial<SbEnvironment> = { id: 1, version: 'v2' };
  const mockEdfiTenant: Partial<EdfiTenant> = { id: 10, sbEnvironmentId: 1, name: 'test-tenant' };

  beforeEach(() => {
    odssRepository = mockOdssRepository();
    edorgsRepository = mockEdorgsRepository();
    startingBlocksServiceV2 = {
      odsRowCountService: { rowCount: jest.fn() } as unknown as OdsRowCountService,
    };

    service = new OdssService(
      odssRepository as unknown as Repository<Ods>,
      edorgsRepository as unknown as Repository<Edorg>,
      startingBlocksServiceV2 as StartingBlocksServiceV2
    );

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('uses dto.templateName in odss create flow', async () => {
      const dto = {
        name: 'ODS One',
        templateName: 'TemplateNameValue',
        databaseTemplate: 'DatabaseTemplateValue',
      } as PostOdsDto;
      const sbEnvironment = {
        ...mockSbEnvironment,
        startingBlocks: false,
      } as SbEnvironment;
      const createdOds = { id: 1, odsInstanceName: 'ODS One' };

      startingBlocksServiceV2.createOds = jest
        .fn()
        .mockResolvedValue({ status: 'SUCCESS' });
      odssRepository.findOneBy.mockResolvedValue(createdOds);

      await service.create(sbEnvironment, mockEdfiTenant as EdfiTenant, dto);

      expect(startingBlocksServiceV2.createOds).toHaveBeenCalledWith(
        sbEnvironment,
        mockEdfiTenant,
        'ODS One',
        'TemplateNameValue'
      );
    });
  });
});
