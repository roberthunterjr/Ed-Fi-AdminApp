import 'reflect-metadata';
import { CreateOds } from './CreateOdsPage';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { odsQueries, instancesV2 } from '../../api';
import { MAX_ODS_NAME_LENGTH } from '@edanalytics/models';

jest.mock('@edanalytics/common-ui', () => ({
  PageTemplate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('react-hook-form', () => ({
  useForm: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../../Layout/FeedbackBanner', () => ({
  usePopBanner: jest.fn(() => jest.fn()),
}));

jest.mock('../../helpers', () => {
  const useTeamEdfiTenantNavContextLoaded = jest.fn();
  return {
    SelectOdsTemplate: () => null,
    useNavToParent: jest.fn(() => '/parent'),
    useTeamEdfiTenantNavContextLoaded,
    // Mirrors the real useOdsTerminology (now in helpers/) so this pre-existing
    // mock of the whole '../../helpers' barrel doesn't shadow it with `undefined`.
    useOdsTerminology: () => {
      const { sbEnvironment } = useTeamEdfiTenantNavContextLoaded();
      return sbEnvironment.version === 'v3'
        ? {
            singular: 'Data Store',
            plural: 'Data Stores',
            listTitle: 'Data Stores',
            createTitle: 'Create new Data Store',
          }
        : {
            singular: 'ODS',
            plural: "ODS's",
            listTitle: 'Operational Data Stores',
            createTitle: 'Create new ODS',
          };
    },
  };
});

jest.mock('../../helpers/mutationErrCallback', () => ({
  mutationErrCallback: jest.fn(() => ({})),
}));

jest.mock('../../api', () => ({
  odsQueries: { post: jest.fn(), getAll: jest.fn() },
  instancesV2: { post: jest.fn() },
}));

const mockUseForm = useForm as jest.Mock;
const mockUseNavigate = useNavigate as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockUseTeamEdfiTenantNavContextLoaded = useTeamEdfiTenantNavContextLoaded as jest.Mock;
const mockOdsPost = odsQueries.post as jest.Mock;
const mockOdsGetAll = odsQueries.getAll as jest.Mock;
const mockInstancesPost = instancesV2.post as jest.Mock;

const navSpy = jest.fn();
const invalidateQueriesSpy = jest.fn();
const odsMutateAsync = jest.fn();
const instancesMutateAsync = jest.fn();
const getFormElement = () => {
  const result = CreateOds() as React.ReactElement;
  return result.type === 'form' ? result : (result.props.children as React.ReactElement);
};

/** Depth-first search of a rendered element tree for the first node matching `predicate`. */
const findElement = (
  node: unknown,
  predicate: (el: React.ReactElement) => boolean
): React.ReactElement | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, predicate);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;

  const element = node as React.ReactElement<{ children?: unknown }>;
  if (predicate(element)) return element;
  return findElement(element.props?.children, predicate);
};

/**
 * The FormControl wrapping the Name field, located by its label rather than by position, so
 * these assertions cannot silently drift onto a different field.
 */
const getNameFormControl = (): React.ReactElement => {
  const controls = getFormElement().props.children as React.ReactElement[];
  const nameControl = controls.find(
    (control) =>
      findElement(
        control,
        (el) => (el.props as { children?: unknown }).children === 'Name'
      ) !== undefined
  );

  if (!nameControl) throw new Error('Could not find the FormControl labelled "Name"');
  return nameControl;
};

/** Flattened text of the Name field's character counter, e.g. "12/46 characters". */
const getCounter = () =>
  findElement(getNameFormControl(), (el) => {
    const { children } = el.props as { children?: unknown };
    return Array.isArray(children) && children.includes(' characters');
  });

const counterText = (counter: React.ReactElement | undefined) =>
  ((counter?.props as { children?: unknown[] })?.children ?? []).join('');

const setup = (startingBlocks: boolean, formData: Record<string, unknown>) => {
  mockUseNavigate.mockReturnValue(navSpy);
  mockUseQueryClient.mockReturnValue({ invalidateQueries: invalidateQueriesSpy });
  mockUseTeamEdfiTenantNavContextLoaded.mockReturnValue({
    asId: 1,
    sbEnvironmentId: 2,
    edfiTenantId: 3,
    edfiTenant: { id: 3 },
    sbEnvironment: { startingBlocks },
  });

  mockUseForm.mockReturnValue({
    register: jest.fn(() => ({})),
    control: {},
    handleSubmit: (submit: (data: Record<string, unknown>) => Promise<void>) => () => submit(formData),
    setError: jest.fn(),
    // Reads from the same formData the submit uses, so the character counter
    // reflects the name under test rather than a constant.
    watch: jest.fn((field: string) => formData[field]),
    formState: { errors: {}, isSubmitting: false },
  });

  odsMutateAsync.mockImplementation(
    (_args: unknown, callbacks: { onSuccess?: (result: { id: number }) => void }) => {
      callbacks.onSuccess?.({ id: 101 });
      return Promise.resolve({ id: 101 });
    }
  );
  instancesMutateAsync.mockImplementation(
    (_args: unknown, callbacks: { onSuccess?: (result: { id: number }) => void }) => {
      callbacks.onSuccess?.({ id: 202 });
      return Promise.resolve({ id: 202 });
    }
  );
  mockOdsPost.mockReturnValue({ mutateAsync: odsMutateAsync });
  mockOdsGetAll.mockReturnValue({
    queryKey: ['edfi-tenants', '3', 'odss', 'list', 'teams', '1'],
  });
  mockInstancesPost.mockReturnValue({ mutateAsync: instancesMutateAsync });
};

describe('CreateOds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesSpy.mockClear();
  });

  it('uses instances mutation with databaseTemplate for non-startingBlocks', async () => {
    setup(false, { name: 'ODS One', databaseTemplate: 'Minimal' });

    const form = getFormElement();
    await form.props.onSubmit();

    expect(instancesMutateAsync).toHaveBeenCalledWith(
      { entity: { name: 'ODS One', databaseTemplate: 'Minimal' } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(odsMutateAsync).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['edfi-tenants', '3', 'odss', 'list', 'teams', '1'],
    });
    expect(navSpy).toHaveBeenCalledWith('/parent');
  });

  it('uses ods mutation for startingBlocks', async () => {
    setup(true, { name: 'ODS One', templateName: 'GrandBend' });

    const form = getFormElement();
    await form.props.onSubmit();

    expect(odsMutateAsync).toHaveBeenCalledWith(
      { entity: { name: 'ODS One', templateName: 'GrandBend' } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(instancesMutateAsync).not.toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith('/as/1/sb-environments/2/edfi-tenants/3/odss/101');
  });

  it('titles the page "Create new Data Store" for a v3 environment', () => {
    setup(false, { name: 'Instance One', databaseTemplate: 'Minimal' });
    mockUseTeamEdfiTenantNavContextLoaded.mockReturnValue({
      asId: 1,
      sbEnvironmentId: 2,
      edfiTenantId: 3,
      edfiTenant: { id: 3 },
      sbEnvironment: { startingBlocks: false, version: 'v3' },
    });

    const result = CreateOds() as React.ReactElement<{ title: string }>;

    expect(result.props.title).toBe('Create new Data Store');
  });

  it('caps the Name input at the portable database name limit', () => {
    setup(false, { name: 'Instance One', databaseTemplate: 'Minimal' });

    const input = findElement(
      getNameFormControl(),
      (el) => (el.props as { maxLength?: number }).maxLength !== undefined
    );

    expect(input?.props).toMatchObject({ maxLength: MAX_ODS_NAME_LENGTH });
  });

  it('counts the current name length against the maximum', () => {
    setup(false, { name: 'Instance One', databaseTemplate: 'Minimal' });

    // 'Instance One' is 12 characters.
    expect(counterText(getCounter())).toBe(`12/${MAX_ODS_NAME_LENGTH} characters`);
  });

  it('counts zero when no name has been entered yet', () => {
    setup(false, { databaseTemplate: 'Minimal' });

    expect(counterText(getCounter())).toBe(`0/${MAX_ODS_NAME_LENGTH} characters`);
  });

  it('counts surrounding whitespace, which the maxLength ceiling also counts', () => {
    setup(false, { name: '  Instance One  ', databaseTemplate: 'Minimal' });

    // 16 raw characters. Validation trims to 12, but the input stops accepting at 46
    // raw, so the counter has to agree with the raw ceiling to stay truthful.
    expect(counterText(getCounter())).toBe(`16/${MAX_ODS_NAME_LENGTH} characters`);
  });

  it('marks the counter when whitespace padding reaches the maximum', () => {
    setup(false, { name: ` ${'a'.repeat(MAX_ODS_NAME_LENGTH - 1)}`, databaseTemplate: 'Minimal' });

    expect(getCounter()?.props).toMatchObject({ color: 'red.500' });
  });

  it('marks the counter once the name reaches the maximum', () => {
    setup(false, { name: 'a'.repeat(MAX_ODS_NAME_LENGTH), databaseTemplate: 'Minimal' });

    expect(getCounter()?.props).toMatchObject({ color: 'red.500' });
  });

  it('leaves the counter unmarked below the maximum', () => {
    setup(false, { name: 'a'.repeat(MAX_ODS_NAME_LENGTH - 1), databaseTemplate: 'Minimal' });

    expect(getCounter()?.props).toMatchObject({ color: undefined });
  });
});
