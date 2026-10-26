import {
  Alert,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  FormControl,
  FormLabel,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  chakra,
} from '@chakra-ui/react';
import { Icons, PageTemplate } from '@edanalytics/common-ui';
import { resolveOdsApiUrls } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { edfiTenantQueriesGlobal, odsQueries, sbEnvironmentQueriesGlobal } from '../../api';
import { getOdsTerminology, useNavToParent } from '../../helpers';
import { config } from '../../../config/config';
import { CertificationAuthenticateForm } from './CertificationAuthenticateForm';
import { isAuthValidFor, useCertificationAuth } from './CertificationAuthContext';
import { useCertificationSelection } from './useCertificationSelection';
import { displayNameOf, formatArtifactVersion } from './certificationCatalog';
import { useCertificationCatalog } from './useCertificationCatalog';

const TENANT_TOOLTIP =
  'A tenant is a separate set of data inside this environment, usually one per organization (for example, a school district). Choose the tenant your API key and secret were created for.';
const ODS_TOOLTIP: Record<'v2' | 'v3', string> = {
  v2: "The Operational Data Store (ODS) is the database your application reads from and writes to through the Ed-Fi API. Choose the one you're certifying. Your key and secret must belong to it.",
  v3: "The data store is the database your application reads from and writes to through the Ed-Fi API. Choose the one you're certifying. Your key and secret must belong to it.",
};

const LabelWithTooltip = ({ label, tooltip }: { label: string; tooltip: string }) => (
  <FormLabel>
    {label}{' '}
    <Tooltip label={tooltip} hasArrow>
      <chakra.span tabIndex={0} aria-label={`About ${label}`}>
        <Icons.InfoCircle />
      </chakra.span>
    </Tooltip>
  </FormLabel>
);

export const RequestCertificationPage = () => {
  const navigate = useNavigate();
  const sbEnvironmentId = Number(useParams().sbEnvironmentId);
  const { edfiTenantId, odsId, setSelection, toSearch } = useCertificationSelection();
  const { auth, clearAuth } = useCertificationAuth();
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const catalog = useCertificationCatalog(sbEnvironmentId);
  const hasCatalog = catalog.catalogVersion !== undefined;

  const tableScenarios = useMemo(
    () =>
      catalog.areas
        .filter((area) => selectedAreaId === '' || String(area.areaId) === selectedAreaId)
        .flatMap((area) => area.scenarios.map((scenario) => ({ area, scenario }))),
    [catalog.areas, selectedAreaId],
  );

  const navToParentOptions = useNavToParent();

  const sbEnvironmentQuery = useQuery(sbEnvironmentQueriesGlobal.getOne({ id: sbEnvironmentId }));
  const sbEnvironment = sbEnvironmentQuery.data;
  const version = sbEnvironment?.version;
  // Wait until certification is known to be supported. The tenant and ODS endpoints aren't
  // behind the certification check, but any failure of theirs (e.g. a 403 without tenant
  // read) goes to the route error page, which would hide the unsupported warning.
  const tenantsQuery = useQuery(
    edfiTenantQueriesGlobal.getAll({ sbEnvironmentId, enabled: catalog.isSupported }),
  );
  const tenants = Object.values(tenantsQuery.data ?? {});
  const edfiTenant = tenants.find((t) => t.id === edfiTenantId);
  const showOds = version !== 'v1';
  const odsQuery = useQuery(
    odsQueries.getAll({ edfiTenant: edfiTenant!, enabled: !!edfiTenant && showOds }),
  );
  const odss = Object.values(odsQuery.data ?? {});
  const odsRequired = showOds && odss.length > 0;
  // Fail closed: don't let the form run before we know whether an ODS must be chosen.
  // Query errors go to the route error page (the query builder sets throwOnError: true), so only loading needs a guard here.
  const isLoadingSelection =
    sbEnvironmentQuery.isPending ||
    tenantsQuery.isPending ||
    (showOds && !!edfiTenant && odsQuery.isPending);

  // A tenant ID from the URL that isn't in the list (stale link) counts as unset.
  useEffect(() => {
    if (tenantsQuery.isPending) return;
    if (edfiTenantId !== undefined && edfiTenant) return;
    if (tenants.length === 1) {
      setSelection({ edfiTenantId: tenants[0].id, odsId: undefined });
    } else if (edfiTenantId !== undefined) {
      setSelection({ edfiTenantId: undefined, odsId: undefined });
    }
  }, [tenantsQuery.isPending, tenants, edfiTenantId, edfiTenant, setSelection]);

  const resolved = useMemo(
    () =>
      edfiTenant
        ? resolveOdsApiUrls(sbEnvironment?.configPublic?.odsApiMeta?.urls, edfiTenant.name)
        : undefined,
    [sbEnvironment, edfiTenant],
  );
  const contextRouting = resolved?.status === 'context-routing';
  // A single ODS needs no choice: select it once the list has loaded (after any stale ID is cleared).
  useEffect(() => {
    if (!showOds || contextRouting || !edfiTenant || odsQuery.isPending) return;
    if (odsId === undefined && odss.length === 1) {
      setSelection({ odsId: odss[0].id });
    }
  }, [showOds, contextRouting, edfiTenant, odsQuery.isPending, odss, odsId, setSelection]);

  useEffect(() => {
    if (odsId === undefined || odsQuery.isPending) return;
    if (!odss.some((ods) => ods.id === odsId)) {
      setSelection({ odsId: undefined });
    }
  }, [odsQuery.isPending, odss, odsId, setSelection]);

  const isAuthenticated = isAuthValidFor(auth, edfiTenantId, odsId);
  const odsLabel = getOdsTerminology(version).singular;

  if (!config.showRequestCertification) {
    return null;
  }

  const cancelButtons = (
    <ButtonGroup mt={4} colorScheme="primary">
      <Button
        variant="ghost"
        isLoading={false}
        type="reset"
        onClick={() => {
          clearAuth();
          navigate(navToParentOptions);
        }}
      >
        Cancel
      </Button>
    </ButtonGroup>
  );

  // Until the environment loads we can't tell whether to show the form or the warning.
  if (sbEnvironmentQuery.isPending) {
    return (
      <PageTemplate title="Request Certification">
        <Text>Loading...</Text>
      </PageTemplate>
    );
  }

  // The API refuses these environments too; this keeps the page and says why.
  if (catalog.unsupportedMessage) {
    return (
      <PageTemplate title="Request Certification">
        <Alert status="warning">
          <AlertIcon />
          {catalog.unsupportedMessage}
        </Alert>
        <chakra.form w="full">{cancelButtons}</chakra.form>
      </PageTemplate>
    );
  }

  if (contextRouting) {
    return (
      <PageTemplate title="Request Certification">
        <Alert status="warning">
          <AlertIcon />
          This environment uses context-based routing, which certification doesn&apos;t support yet.
        </Alert>
        <chakra.form w="full">{cancelButtons}</chakra.form>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate title="Request Certification">
      <chakra.form w="full">
        <Box w="30em" maxW="100%">
          {tenants.length >= 1 && (
            <FormControl>
              <LabelWithTooltip label="Tenant" tooltip={TENANT_TOOLTIP} />
              <Select
                placeholder="Select tenant"
                isDisabled={tenants.length === 1}
                value={edfiTenantId ?? ''}
                onChange={(event) =>
                  setSelection({
                    edfiTenantId: Number(event.target.value) || undefined,
                    odsId: undefined,
                  })
                }
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.displayName}
                  </option>
                ))}
              </Select>
            </FormControl>
          )}

          {odsRequired && (
            <FormControl>
              <LabelWithTooltip
                label={odsLabel}
                tooltip={ODS_TOOLTIP[version === 'v3' ? 'v3' : 'v2']}
              />
              <Select
                placeholder={`Select ${odsLabel}`}
                isDisabled={odss.length === 1}
                value={odsId ?? ''}
                onChange={(event) =>
                  setSelection({ odsId: Number(event.target.value) || undefined })
                }
              >
                {odss.map((ods) => (
                  <option key={ods.id} value={ods.id}>
                    {ods.displayName}
                  </option>
                ))}
              </Select>
            </FormControl>
          )}

          <CertificationAuthenticateForm
            sbEnvironmentId={sbEnvironmentId}
            edfiTenantId={edfiTenantId}
            odsId={odsId}
            isDisabled={isLoadingSelection || (odsRequired && odsId === undefined)}
          />

          <Box mt={4}>
            {catalog.isPending ? (
              <Text color="gray.600">Loading certification version...</Text>
            ) : catalog.catalogVersion ? (
              <>
                <Text>
                  Certification {formatArtifactVersion(catalog.catalogVersion.artifactVersion)}
                </Text>
                <Text>Data Standard {catalog.catalogVersion.dataStandardVersion}</Text>
              </>
            ) : (
              <Text color="gray.600">Certification version not available</Text>
            )}
          </Box>

          {!catalog.isPending && !hasCatalog && (
            <Alert status="warning" mt={4}>
              <AlertIcon />
              {/* An unknown data standard is unsupported, so it never reaches this alert. */}
              No certification catalog is available for data standard {catalog.dataStandardVersion}.
            </Alert>
          )}

          <FormControl>
            <FormLabel>Area or Group Filter</FormLabel>
            <Select
              placeholder={hasCatalog ? 'All area or group values' : 'No catalog available'}
              value={selectedAreaId}
              isDisabled={!hasCatalog}
              onChange={(event) => setSelectedAreaId(event.target.value)}
            >
              {catalog.areas.map((area) => (
                <option key={area.areaId} value={area.areaId}>
                  {displayNameOf(area)}
                </option>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box mt={6} p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="gray.50">
          <Text mb={3} fontWeight="semibold">
            Scenarios
          </Text>

          <Table size="sm" mt={0}>
            <Thead>
              <Tr>
                <Th>Area or Group</Th>
                <Th>Scenario</Th>
                <Th textAlign="right">Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {tableScenarios.map(({ area, scenario }) => (
                <Tr key={scenario.scenarioId}>
                  <Td>{displayNameOf(area)}</Td>
                  <Td>{displayNameOf(scenario)}</Td>
                  <Td textAlign="right">
                    <Button
                      size="sm"
                      colorScheme="primary"
                      type="button"
                      isDisabled={!isAuthenticated}
                      onClick={() =>
                        navigate({
                          pathname: 'execution',
                          search: toSearch({ scenarioId: scenario.scenarioId }),
                        })
                      }
                    >
                      Validate Scenario
                    </Button>
                  </Td>
                </Tr>
              ))}
              {tableScenarios.length === 0 && (
                <Tr>
                  <Td colSpan={3}>
                    <Text color="gray.600">
                      {catalog.isPending
                        ? 'Loading scenarios...'
                        : 'No scenarios found for the current filters.'}
                    </Text>
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Box>

        {cancelButtons}
      </chakra.form>
    </PageTemplate>
  );
};
