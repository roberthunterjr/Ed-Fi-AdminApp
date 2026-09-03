import 'reflect-metadata';
import { EditApiClient } from './EditApiClient';

import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useOdsTerminology, useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { useApiClientConfig } from './apiClientConfig';

jest.mock('react-router', () => ({ useNavigate: jest.fn() }));
jest.mock('react-hook-form', () => ({ useForm: jest.fn() }));
jest.mock('@tanstack/react-table', () => ({ noop: () => undefined }));
jest.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: jest.fn((Dto) => Dto),
}));
jest.mock('../../Layout/FeedbackBanner', () => ({ usePopBanner: jest.fn(() => jest.fn()) }));
jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(),
  useOdsTerminology: jest.fn(),
}));
jest.mock('../../helpers/mutationErrCallback', () => ({ mutationErrCallback: jest.fn(() => ({})) }));
jest.mock('../../helpers/EntitySelectors', () => ({ SelectOds: () => null }));
// Only referenced in a type position (`Parameters<typeof apiClientQueriesV2.put>`),
// so babel elides the import — mocked anyway so a future value-level use can't
// silently drag the real (ESM-only, Jest-unparseable) query chain in.
jest.mock('../../api/queries/queries.v7', () => ({ apiClientQueriesV2: {} }));
// './apiClientConfig' transitively pulls in the real '../../api/queries/queries.v7'
// chain, which Jest can't parse without extra config. Mock the module wholesale,
// but re-export the real `getDataStoreIds` from './apiClientEntity' — which has
// zero dependency on that chain — so this spec exercises the real extraction.
jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: Object.assign(jest.fn(), { match: jest.fn() }),
  getDataStoreIds: jest.requireActual('./apiClientEntity').getDataStoreIds,
}));

const mockUseForm = useForm as jest.Mock;
const mockUseNavigate = useNavigate as jest.Mock;
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

const apiClientBase = {
  id: 1,
  name: 'Client1',
  key: 'key-1',
  isApproved: true,
  keyStatus: 'Active',
  applicationId: 7,
};
const v2ApiClient = { ...apiClientBase, odsInstanceIds: [9] };
const v3ApiClient = { ...apiClientBase, dataStoreIds: [9] };

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

// EditApiClient is the `.match()` dispatcher; calling it returns an unrendered
// <EditApiClientForm> element. Invoke that element's type with its own props to
// run the inner generic form component's body.
const getFormElement = (apiClient: Record<string, unknown>) => {
  const outer = EditApiClient({ apiClient: apiClient as never }) as React.ReactElement;
  return (outer.type as (props: unknown) => React.ReactElement)(outer.props);
};

const setup = (version: 'v2' | 'v3', terminology = version === 'v3' ? v3Terminology : v2Terminology) => {
  const putMutateAsync = jest.fn().mockResolvedValue(undefined);
  mockUseNavigate.mockReturnValue(jest.fn());
  mockUseOdsTerminology.mockReturnValue(terminology);
  mockUseNavContext.mockReturnValue({
    edfiTenantId: 3,
    teamId: 1,
    edfiTenant: { id: 3, sbEnvironmentId: 2 },
  });
  // handleSubmit's submit callback hands back the real `defaultValues` passed to
  // useForm(...), mirroring how react-hook-form populates the submitted data
  // from them — so the defaultValues construction (including which name the
  // diverging field is written under) is exercised too, not stubbed over.
  mockUseForm.mockImplementation((options: { defaultValues?: Record<string, unknown> }) => ({
    register: jest.fn(() => ({})),
    watch: jest.fn(() => undefined),
    setValue: jest.fn(),
    handleSubmit: (submit: (data: Record<string, unknown>) => Promise<void>) => () =>
      submit({ ...options.defaultValues }),
    setError: jest.fn(),
    formState: { errors: {}, isSubmitting: false },
  }));
  const config = {
    version,
    queries: { put: jest.fn(() => ({ mutateAsync: putMutateAsync })) },
    PutDto: class PutDtoStub {},
    PutFormDto: class PutFormDtoStub {},
  };
  mockMatch.mockImplementation((handlers: Record<string, (cfg: typeof config) => unknown>) =>
    handlers[version](config)
  );
  return { putMutateAsync };
};

describe('EditApiClient', () => {
  afterEach(() => jest.clearAllMocks());

  it('submits odsInstanceIds for a v2 tenant', async () => {
    const { putMutateAsync } = setup('v2');

    const form = getFormElement(v2ApiClient);
    await form.props.onSubmit();

    expect(putMutateAsync).toHaveBeenCalledWith(
      { entity: expect.objectContaining({ odsInstanceIds: [9] }), pathParams: {} },
      expect.anything()
    );
    // The V3-only field name must never appear on a V2 payload.
    const [[{ entity }]] = putMutateAsync.mock.calls;
    expect(entity).not.toHaveProperty('dataStoreIds');
  });

  it('submits dataStoreIds for a v3 tenant', async () => {
    const { putMutateAsync } = setup('v3');

    const form = getFormElement(v3ApiClient);
    await form.props.onSubmit();

    expect(putMutateAsync).toHaveBeenCalledWith(
      { entity: expect.objectContaining({ dataStoreIds: [9] }), pathParams: {} },
      expect.anything()
    );
    // The V2-only field name must never appear on a V3 payload.
    const [[{ entity }]] = putMutateAsync.mock.calls;
    expect(entity).not.toHaveProperty('odsInstanceIds');
  });

  it('puts via useApiClientConfig().queries, not a hardcoded v2 query', async () => {
    const { putMutateAsync } = setup('v3');

    const form = getFormElement(v3ApiClient);
    await form.props.onSubmit();

    expect(putMutateAsync).toHaveBeenCalled();
  });

  it('labels the field "Data Store" for a v3 tenant', () => {
    setup('v3');

    const text = collectText(getFormElement(v3ApiClient));

    expect(text).toContain('Data Store');
    expect(text).not.toContain('ODS');
  });

  it('labels the field "ODS" for a v2 tenant', () => {
    setup('v2');

    const text = collectText(getFormElement(v2ApiClient));

    expect(text).toContain('ODS');
    expect(text).not.toContain('Data Store');
  });

  it('does not render a Status field', () => {
    setup('v2');

    const form = getFormElement(v2ApiClient);

    expect(collectText(form)).not.toContain('Status');
  });
});
