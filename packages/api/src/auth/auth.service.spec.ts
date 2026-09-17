import 'reflect-metadata';
import { AuthService } from './auth.service';

/**
 * Scope: this spec only covers the relations-shape conversions this branch touched
 * (array form -> object form, required by TypeORM 1.1.0). It is not a full spec for
 * AuthService's privilege/authorization logic.
 */
describe('AuthService relations shape (TypeORM 1.1.0 conversions)', () => {
  const buildService = (
    overrides: {
      ownershipsRepository?: object;
      usersRepo?: object;
      utmRepo?: object;
    } = {},
  ) => {
    const odssRepository = {};
    const edfiTenantsRepository = {};
    const edorgsRepository = {};
    const edorgClosureRepository = {};
    const ownershipsRepository = overrides.ownershipsRepository ?? {};
    const usersRepo = overrides.usersRepo ?? {};
    const utmRepo = overrides.utmRepo ?? {};
    const entityManager = { getTreeRepository: jest.fn().mockReturnValue({}) };
    const cacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    return new AuthService(
      odssRepository as never,
      edfiTenantsRepository as never,
      edorgsRepository as never,
      edorgClosureRepository as never,
      ownershipsRepository as never,
      usersRepo as never,
      utmRepo as never,
      entityManager as never,
      cacheManager as never,
    );
  };

  describe('getUserPrivileges', () => {
    it('loads the team membership and the user with the { role: true } relations shape', async () => {
      const utmRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const usersRepo = {
        findOneOrFail: jest.fn().mockResolvedValue({ id: 1, role: { privilegeIds: [] } }),
      };
      const service = buildService({ utmRepo, usersRepo });

      await service.getUserPrivileges(1, 2);

      expect(utmRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 1, teamId: 2 },
        relations: { role: true },
      });
      expect(usersRepo.findOneOrFail).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        relations: { role: true },
      });
    });

    it('skips the team membership lookup when no teamId is given', async () => {
      const utmRepo = { findOne: jest.fn() };
      const usersRepo = {
        findOneOrFail: jest.fn().mockResolvedValue({ id: 1, role: { privilegeIds: [] } }),
      };
      const service = buildService({ utmRepo, usersRepo });

      await service.getUserPrivileges(1);

      expect(utmRepo.findOne).not.toHaveBeenCalled();
      expect(usersRepo.findOneOrFail).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        relations: { role: true },
      });
    });
  });

  describe('findActiveUserById', () => {
    it('loads the user with the { role: true } relations shape', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
      const service = buildService({ usersRepo });

      await service.findActiveUserById(1);

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        relations: { role: true },
      });
    });
  });

  describe('validateUser (via private getUser)', () => {
    it('loads the user by username and its team memberships with the { role: true } / { role: true, team: true } relations shapes', async () => {
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 1, isActive: true }),
      };
      const utmRepo = { find: jest.fn().mockResolvedValue([]) };
      const service = buildService({ usersRepo, utmRepo });

      const user = await service.validateUser({ username: 'alice' });

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { username: 'alice' },
        relations: { role: true },
      });
      expect(utmRepo.find).toHaveBeenCalledWith({
        where: { userId: 1, roleId: expect.anything() },
        relations: { role: true, team: true },
      });
      expect(user).toEqual({ id: 1, isActive: true });
    });

    it('returns null without querying when neither username nor clientId is given', async () => {
      const usersRepo = { findOne: jest.fn() };
      const service = buildService({ usersRepo });

      const user = await service.validateUser({});

      expect(usersRepo.findOne).not.toHaveBeenCalled();
      expect(user).toBeNull();
    });
  });

  describe('constructTeamOwnerships', () => {
    it('loads ownerships with the 3-level-deep relations shape TypeORM 1.1.0 requires', async () => {
      // The ownerships repository is stubbed to reject so the huge downstream authorization
      // build-out (edorg tree queries, DB-specific query builders, etc.) never runs — this
      // test's only job is to pin down the relations shape of this one query, which the
      // rest of the class's tree-building logic is unrelated to.
      const marker = new Error('stop after ownerships query');
      const ownershipsRepository = { find: jest.fn().mockRejectedValue(marker) };
      const service = buildService({ ownershipsRepository });

      await expect(service.constructTeamOwnerships(1)).rejects.toThrow(marker);

      expect(ownershipsRepository.find).toHaveBeenCalledWith({
        where: { teamId: 1 },
        relations: {
          sbEnvironment: { edfiTenants: true },
          edfiTenant: { sbEnvironment: true },
          ods: true,
          edorg: true,
          role: true,
          integrationProvider: true,
        },
      });
    });
  });
});
