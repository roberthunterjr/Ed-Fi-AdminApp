import 'reflect-metadata';
import { CreateApiClientPage } from './CreateApiClientPage';

import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNavToParent,
  useOdsTerminology,
  useTeamEdfiTenantNavContextLoaded,
} from '../../helpers';
import { useApiClientConfig } from './apiClientConfig';

jest.mock('@edanalytics/common-ui', () => ({
  PageTemplate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-router', () => ({ useNavigate: jest.fn(), useParams: jest.fn() }));
jest.mock('react-hook-form', () => ({ useForm: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn() }));
jest.mock('@tanstack/react-table', () => ({ noop: () => undefined }));
jest.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: jest.fn((Dto) => Dto),
}));
jest.mock('../../Layout/FeedbackBanner', () => ({ usePopBanner: jest.fn(() => jest.fn()) }));
jest.mock('../../helpers', () => ({
  useNavToParent: jest.fn(() => '/parent'),
  useTeamEdfiTenantNavContextLoaded: jest.fn(),
  useOdsTerminology: jest.fn(),
}));
jest.mock('../../helpers/mutationErrCallback', () => ({ mutationErrCallback: jest.fn(() => ({})) }));
jest.mock('../../helpers/EntitySelectors', () => ({ SelectOds: () => null }));
// Only referenced in a type position (`Parameters<typeof apiClientQueriesV2.post>`),
// so babel elides the import — mocked anyway so a future value-level use can't
// silently drag the real (ESM-only, Jest-unparseable) query chain in.
jest.mock('../../api/queries/queries.v7', () => ({ apiClientQueriesV2: {} }));
jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: Object.assign(jest.fn(), { match: jest.fn() }),
}));

const mockUseForm = useForm as jest.Mock;
const mockUseNavigate = useNavigate as jest.Mock;
const mockUseParams = useParams as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockUseNavToParent = useNavToParent as jest.Mock;
const mockUseNavContext = useTeamEdfiTenantNavContextLoaded as jest.Mock;
const mockUseOdsTerminology = useOdsTerminology as jest.Mock;
const mockMatch = useApiClientConfig.match as jest.Mock;

const v2Terminology = {
  singular: 'ODS',
  plural: "ODS's",
  listTitle: 'Operational Data Stores',
  createTitle: 'Create new ODS',
};
const v3Terminology = {
  singular: 'Data Store',
  plural: 'Data Stores',
  listTitle: 'Data Stores',
  createTitle: 'Create new Data Store',
};

// Walks the unrendered element tree collecting every string/number child, so the
// static labels can be asserted without mounting Chakra.
const collectText = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return collectText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
};

// CreateApiClientPage is the `.match()` dispatcher; calling it returns an
// unrendered <CreateApiClientForm> element. Invoke that element's type with its
// own props to run the inner generic form component's body.
const getPageElement = () => {
  const outer = CreateApiClientPage() as React.ReactElement;
  return (outer.type as (props: unknown) => React.ReactElement)(outer.props);
};

const setup = (
  version: 'v2' | 'v3',
  formData: Record<string, unknown>,
  terminology = version === 'v3' ? v3Terminology : v2Terminology
) => {
  const postMutateAsync = jest.fn().mockResolvedValue({ id: 42 });
  const getAll = jest.fn(() => ({ queryKey: ['api-clients'] }));
  mockUseParams.mockReturnValue({ applicationId: '7' });
  mockUseNavigate.mockReturnValue(jest.fn());
  mockUseNavToParent.mockReturnValue('/parent');
  mockUseQueryClient.mockReturnValue({ invalidateQueries: jest.fn() });
  mockUseOdsTerminology.mockReturnValue(terminology);
  mockUseNavContext.mockReturnValue({
    edfiTenantId: 3,
    teamId: 1,
    edfiTenant: { id: 3, sbEnvironmentId: 2 },
  });
  mockUseForm.mockReturnValue({
    register: jest.fn(() => ({})),
    watch: jest.fn(() => undefined),
    setValue: jest.fn(),
    handleSubmit: (submit: (data: Record<string, unknown>) => Promise<void>) => () =>
      submit(formData),
    setError: jest.fn(),
    formState: { errors: {}, isSubmitting: false },
  });
  const config = {
    version,
    queries: { post: jest.fn(() => ({ mutateAsync: postMutateAsync })), getAll },
    PostDto: class PostDtoStub {},
    PostFormDto: class PostFormDtoStub {},
  };
  mockMatch.mockImplementation((handlers: Record<string, (cfg: typeof config) => unknown>) =>
    handlers[version](config)
  );
  return { postMutateAsync };
};

describe('CreateApiClientPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('submits odsInstanceIds for a v2 tenant', async () => {
    const { postMutateAsync } = setup('v2', {
      name: 'Client1',
      isApproved: true,
      applicationId: 7,
      odsInstanceId: 9,
    });

    const form = getPageElement().props.children;
    await form.props.onSubmit();

    expect(postMutateAsync).toHaveBeenCalledWith(
      { entity: expect.objectContaining({ odsInstanceIds: [9] }), pathParams: {} },
      expect.anything()
    );
    // The V3-only field name must never appear on a V2 payload.
    const [[{ entity }]] = postMutateAsync.mock.calls;
    expect(entity).not.toHaveProperty('dataStoreIds');
  });

  it('submits dataStoreIds for a v3 tenant', async () => {
    const { postMutateAsync } = setup('v3', {
      name: 'Client1',
      isApproved: true,
      applicationId: 7,
      dataStoreId: 9,
    });

    const form = getPageElement().props.children;
    await form.props.onSubmit();

    expect(postMutateAsync).toHaveBeenCalledWith(
      { entity: expect.objectContaining({ dataStoreIds: [9] }), pathParams: {} },
      expect.anything()
    );
    // The V2-only field name must never appear on a V3 payload.
    const [[{ entity }]] = postMutateAsync.mock.calls;
    expect(entity).not.toHaveProperty('odsInstanceIds');
  });

  it('posts via useApiClientConfig().queries, not a hardcoded v2 query', async () => {
    const { postMutateAsync } = setup('v3', { name: 'Client1', dataStoreId: 9 });

    const form = getPageElement().props.children;
    await form.props.onSubmit();

    expect(postMutateAsync).toHaveBeenCalled();
  });

  it('labels the field "Data Store" for a v3 tenant', () => {
    setup('v3', { name: 'Client1', dataStoreId: 9 });

    const text = collectText(getPageElement());

    expect(text).toContain('Data Store');
    expect(text).not.toContain('ODS');
  });

  it('labels the field "ODS" for a v2 tenant', () => {
    setup('v2', { name: 'Client1', odsInstanceId: 9 });

    const text = collectText(getPageElement());

    expect(text).toContain('ODS');
    expect(text).not.toContain('Data Store');
  });
});
