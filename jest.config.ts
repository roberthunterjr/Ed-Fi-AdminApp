import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  globalSetup: './jest-global-setup.js',
  setupFiles: ['./jest.setup.js'],
  projects: await getJestProjectsAsync(),
});
