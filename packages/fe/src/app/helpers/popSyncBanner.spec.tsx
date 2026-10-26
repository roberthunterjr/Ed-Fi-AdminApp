import 'reflect-metadata';
import { popSyncBanner } from './popSyncBanner';

jest.mock('react-router', () => ({ Link: () => null }));
jest.mock('@chakra-ui/react', () => ({ Link: () => null }));
jest.mock('../Layout/FeedbackBanner', () => ({ usePopBanner: jest.fn() }));

const bannerArg = (popBanner: jest.Mock) => popBanner.mock.calls[0][0];
const findLinkTo = (node: unknown): string | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findLinkTo(child);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;
  const props = (node as { props: { to?: string; children?: unknown } }).props;
  return props.to ?? findLinkTo(props.children);
};

describe('popSyncBanner', () => {
  it('keeps the default sync title and link when linkTo and subject are not given', () => {
    const popBanner = jest.fn();
    popSyncBanner({ popBanner, syncQueue: { id: 'abc', state: 'created' } });

    expect(bannerArg(popBanner)).toMatchObject({ type: 'Info', title: 'Sync queued' });
    expect(findLinkTo(bannerArg(popBanner).message)).toBe('/sb-sync-queues/abc');
  });

  it('uses linkTo and subject when given', () => {
    const popBanner = jest.fn();
    popSyncBanner({
      popBanner,
      syncQueue: { id: 'abc', state: 'created' },
      linkTo: '/as/1/odss/jobs/create/xyz',
      subject: 'Data store creation',
    });

    expect(bannerArg(popBanner)).toMatchObject({ type: 'Info', title: 'Data store creation queued' });
    expect(findLinkTo(bannerArg(popBanner).message)).toBe('/as/1/odss/jobs/create/xyz');
  });

  it.each([
    ['completed', 'Success', 'Data store deletion completed'],
    ['failed', 'Error', 'Data store deletion contained an error'],
  ] as const)('titles a %s job', (state, type, title) => {
    const popBanner = jest.fn();
    popSyncBanner({ popBanner, syncQueue: { id: 'a', state }, subject: 'Data store deletion' });

    expect(bannerArg(popBanner)).toMatchObject({ type, title });
  });
});
