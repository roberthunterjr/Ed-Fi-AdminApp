import 'reflect-metadata';
import { EdorgsController } from './edorgs.controller';

describe('EdorgsController.remove', () => {
  it('loads the edorg with the { ods: true } relations shape TypeORM 1.1.0 requires', async () => {
    const edorgsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        educationOrganizationId: 100,
        ods: { id: 5, odsInstanceName: 'ods-a' },
      }),
    };
    const edorgService = { remove: jest.fn().mockResolvedValue(undefined) };
    const checkAbility = jest.fn().mockReturnValue(true);
    const request = { params: {} };
    const sbEnvironment = { configPublic: { values: {} } };
    const edfiTenant = { name: 'tenant-a' };

    const controller = new EdorgsController(
      edorgService as never,
      edorgsRepository as never,
      {} as never,
    );

    await controller.remove(
      1,
      2,
      3,
      edfiTenant as never,
      sbEnvironment as never,
      checkAbility,
      request,
    );

    expect(edorgsRepository.findOne).toHaveBeenCalledWith({
      where: { edfiTenantId: 3, id: 1 },
      relations: { ods: true },
    });
    expect(edorgService.remove).toHaveBeenCalledWith(sbEnvironment, edfiTenant, 'ods-a', '100');
  });
});
