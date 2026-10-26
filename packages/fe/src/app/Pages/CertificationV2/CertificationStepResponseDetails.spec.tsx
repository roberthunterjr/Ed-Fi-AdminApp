import 'reflect-metadata';
import { fireEvent, render, screen } from '@testing-library/react';
import { CertificationSavedStepRunDto, CertificationStepSnapshotDto } from '@edanalytics/models';
import { CertificationStepResponseDetails } from './CertificationStepResponseDetails';
import { useCertificationStepSnapshot } from './useCertificationStepSnapshot';

jest.mock('./useCertificationStepSnapshot', () => ({ useCertificationStepSnapshot: jest.fn() }));

const snapshotArgs = { sbEnvironmentId: 1, edfiTenantId: 10, odsId: 5, sisVersion: 'v5' };

const fieldsRun: CertificationSavedStepRunDto = {
  stepId: 189,
  status: 'failed',
  ranAt: '2026-10-15T15:00:00.000Z',
  inputs: { studentUniqueId: 'S1' },
  responseStatus: 200,
  errors: [],
};

const exceptionRun: CertificationSavedStepRunDto = { ...fieldsRun, responseStatus: 404 };

const mockSnapshot = (snapshot?: CertificationStepSnapshotDto) =>
  (useCertificationStepSnapshot as jest.Mock).mockReturnValue({
    snapshot,
    isPending: false,
    isError: false,
  });

const renderResult = (run: CertificationSavedStepRunDto | undefined, isRunning = false) =>
  render(
    <CertificationStepResponseDetails
      run={run}
      isRunning={isRunning}
      snapshotArgs={snapshotArgs}
    />,
  );

const openPanel = () =>
  fireEvent.click(screen.getByRole('button', { name: /View response details/ }));

const lastHookArgs = () => (useCertificationStepSnapshot as jest.Mock).mock.calls.at(-1)[0];

describe('CertificationStepResponseDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot();
  });

  it('renders nothing before the step has a result', () => {
    const { container } = renderResult(undefined);

    expect(container.textContent).toBe('');
  });

  it('renders nothing while the step runs', () => {
    const { container } = renderResult(fieldsRun, true);

    expect(container.textContent).toBe('');
  });

  it('shows the HTTP status inside the response details', () => {
    renderResult(exceptionRun);
    openPanel();

    expect(screen.getByText('API response:')).toBeTruthy();
    expect(screen.getByText('HTTP 404 Not Found')).toBeTruthy();
  });

  it('shows the number alone for a status without a known reason phrase', () => {
    renderResult({ ...exceptionRun, responseStatus: 418 });
    openPanel();

    expect(screen.getByText('HTTP 418')).toBeTruthy();
  });

  it('shows no HTTP status when the request was never sent', () => {
    renderResult({ ...exceptionRun, responseStatus: null });
    openPanel();

    expect(screen.queryByText('API response:')).toBeNull();
    expect(screen.queryByText(/^HTTP /)).toBeNull();
  });

  describe('response panel', () => {
    it('is collapsed and loads nothing until opened', () => {
      renderResult(fieldsRun);

      expect(lastHookArgs()).toMatchObject({ enabled: false, stepId: 189, ranAt: fieldsRun.ranAt });
      expect(
        screen.queryByText(
          'This snapshot is deleted when the certification request is approved or rejected.',
        ),
      ).toBeNull();
    });

    it('loads the snapshot when opened and shows the disclaimer', () => {
      renderResult(fieldsRun);
      openPanel();

      expect(lastHookArgs()).toMatchObject({ ...snapshotArgs, enabled: true, stepId: 189 });
      expect(
        screen.getByText(
          'This snapshot is deleted when the certification request is approved or rejected.',
        ),
      ).toBeTruthy();
    });

    it('shows the stored body', () => {
      mockSnapshot({ state: 'body', body: '[\n  {\n    "id": "abc123"\n  }\n]' });
      renderResult(fieldsRun);
      openPanel();

      expect(screen.getByText(/"id": "abc123"/)).toBeTruthy();
    });

    it.each([
      [
        { state: 'tooLarge', sizeBytes: 81234 },
        'The response is larger than the 64 KB snapshot limit. To review it, call the Ed-Fi API directly.',
      ],
      [{ state: 'none' }, "No response: the request wasn't sent."],
      [
        { state: 'deleted' },
        'The snapshot was deleted when the certification request was decided.',
      ],
    ])('explains a %j snapshot', (snapshot, text) => {
      mockSnapshot(snapshot as CertificationStepSnapshotDto);
      renderResult(fieldsRun);
      openPanel();

      expect(screen.getByText(text)).toBeTruthy();
    });
  });
});
