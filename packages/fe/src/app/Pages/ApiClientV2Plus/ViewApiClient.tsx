import {
  Attribute,
  AttributeContainer,
  AttributesGrid,
  ContentSection,
} from '@edanalytics/common-ui';
import { Badge } from '@chakra-ui/react';
import {
  GetOdsDto,
} from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  odsQueries,
} from '../../api';
import { useOdsTerminology, useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { OdsLink } from '../../routes';
import { ApiClientEntity, getDataStoreIds } from './apiClientConfig';

interface ViewApiClientProps {
  apiClient: ApiClientEntity;
}

export const ViewApiClient = ({ apiClient }: ViewApiClientProps) => {
  const { edfiTenant, teamId } = useTeamEdfiTenantNavContextLoaded();
  const odsTerminology = useOdsTerminology();

  const odss = useQuery(
    odsQueries.getAll({
      edfiTenant: edfiTenant,
      teamId,
    })
  );
  const odsDataByInstanceId = useMemo(
    () =>
      Object.values(odss.data ?? {}).reduce<Record<string, GetOdsDto>>((map, ods) => {
        map[ods.odsInstanceId!] = ods;
        return map;
      }, {}),
    [odss.data]
  );
  const odssByInstanceId = useMemo(() => ({ data: odsDataByInstanceId }), [odsDataByInstanceId]);

  return apiClient ? (
    <ContentSection>
      <AttributesGrid>
        <Attribute isCopyable label="Name" value={apiClient.name} />
        <AttributeContainer label={odsTerminology.singular}>
          {getDataStoreIds(apiClient).length > 0 &&
            getDataStoreIds(apiClient)
              .map((dataStoreId) => (
                <OdsLink key={dataStoreId} id={dataStoreId} query={odssByInstanceId} />
              ))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .reduce((prev, curr) => [prev, ', ', curr] as any)}
        </AttributeContainer>{' '}
        <AttributeContainer label="Client id" >
          {apiClient.key}
        </AttributeContainer>
        <AttributeContainer label="Enabled" >
          <Badge colorScheme={apiClient.isApproved ? 'green' : 'red'}>
            {apiClient.isApproved ? 'Enabled' : 'Disabled'}
          </Badge>
        </AttributeContainer>
      </AttributesGrid>
    </ContentSection>
  ) : null;
};