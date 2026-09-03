import {
  Button,
  ButtonGroup,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Switch,
  Text,
} from '@chakra-ui/react';
import {
  PutApiClientDtoV2,
  PutApiClientDtoV3,
  PutApiClientFormDtoV2,
  PutApiClientFormDtoV3,
} from '@edanalytics/models';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { MutateOptions } from '@tanstack/react-query';
import { noop } from '@tanstack/react-table';
import { DefaultValues, Path, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { SelectOds } from '../../helpers/EntitySelectors';
import { useOdsTerminology, useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { apiClientQueriesV2 } from '../../api/queries/queries.v7';
import { usePopBanner } from '../../Layout/FeedbackBanner';
import { mutationErrCallback } from '../../helpers/mutationErrCallback';
import { ApiClientEntity, getDataStoreIds, useApiClientConfig } from './apiClientConfig';

// Dispatches on the resolved version via `.match()` rather than destructuring
// `useApiClientConfig()` directly, so `EditApiClientForm`'s generics are tied to
// the actual branch instead of the wider PutApiClientFormDtoV2 | V3 union (see
// the caveat comment in apiClientConfig.ts).
export const EditApiClient = (props: { apiClient: ApiClientEntity }) =>
  useApiClientConfig.match({
    v2: (cfg) => (
      <EditApiClientForm<PutApiClientFormDtoV2, PutApiClientDtoV2>
        config={cfg}
        odsFieldName="odsInstanceId"
        {...props}
      />
    ),
    v3: (cfg) => (
      <EditApiClientForm<PutApiClientFormDtoV3, PutApiClientDtoV3>
        config={cfg}
        odsFieldName="dataStoreId"
        {...props}
      />
    ),
  });

// Two generics, unlike EditApplicationForm's one: an api client's *form* DTO
// (`D`, one id) and its *wire* DTO (`W`, an id array) are different shapes, and
// both diverge between V2 and V3 — `PutApiClientDtoV2.odsInstanceIds` vs
// `PutApiClientDtoV3.dataStoreIds`. Pinning `W` to a single branch (or leaving
// it as the V2|V3 union) makes the other branch's `cfg` structurally
// unassignable to `config`, so the wire DTO gets its own parameter.
function EditApiClientForm<
  D extends PutApiClientFormDtoV2 | PutApiClientFormDtoV3,
  W extends PutApiClientDtoV2 | PutApiClientDtoV3,
>(props: {
  // `put`'s entity/options are parameterized by this component's own W rather
  // than pinned to typeof apiClientQueriesV2.put: V2's and V3's put() differ in
  // both response DTO (GetApiClientDtoV2 vs V3) and request entity
  // (PutApiClientDtoV2 vs V3), so a type fixed to one branch can't structurally
  // accept the other. `options` is typed via `MutateOptions` (the same type
  // `EntityQueryBuilder.put`'s `UseMutationResult['mutateAsync']` uses under the
  // hood, see builder.ts) parameterized by the same variables object
  // `mutateAsync`'s first argument uses, so `onSuccess`/`onError` (including the
  // mutationErrCallback(...) spread at the call site below) stay checked without
  // widening to `any`. TData is `unknown` since onSuccess here never reads the
  // resolved response.
  config: {
    queries: {
      put: (params: Parameters<typeof apiClientQueriesV2.put>[0]) => {
        mutateAsync: (
          args: { entity: W; pathParams: unknown },
          options?: MutateOptions<unknown, unknown, { entity: W; pathParams: unknown }, unknown>
        ) => Promise<unknown>;
      };
    };
    PutDto: new () => W;
    PutFormDto: new () => D;
  };
  odsFieldName: 'odsInstanceId' | 'dataStoreId';
  apiClient: ApiClientEntity;
}) {
  const { apiClient } = props;
  const { queries, PutDto, PutFormDto } = props.config;
  const { teamId, edfiTenant, edfiTenantId } = useTeamEdfiTenantNavContextLoaded();
  const odsTerminology = useOdsTerminology();
  const popBanner = usePopBanner();
  const navigate = useNavigate();
  const resolver = classValidatorResolver(PutFormDto);
  const putApiClient = queries.put({
    edfiTenant,
    teamId,
  });

  const goToView = () => {
    navigate(
      `/as/${teamId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${apiClient.applicationId}/apiClients/${apiClient.id}`
    );
  };

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<D>({
    resolver,
    // react-hook-form's DefaultValues<T>/Path<T>/FieldErrors<T> conditional
    // types don't resolve against a bare generic type parameter (D is
    // concretely PutApiClientFormDtoV2 or V3 at each call site, but this
    // function body is checked against the abstract D) — cast to the exact
    // param type useForm expects. The diverging field is keyed by
    // props.odsFieldName so a V3 tenant seeds `dataStoreId`, never
    // `odsInstanceId`, and getDataStoreIds() reads whichever plural field the
    // entity actually carries.
    defaultValues: {
      id: apiClient.id,
      name: apiClient.name,
      isApproved: apiClient.isApproved,
      applicationId: apiClient.applicationId,
      [props.odsFieldName]: getDataStoreIds(apiClient)[0],
    } as DefaultValues<D>,
  });

  // Same generic-vs-abstract-D limitation as above, for register()/errors. The
  // parameter type is the field-name intersection of both branches (every field
  // here except odsFieldName is identical in name across V2/V3).
  const field = (name: keyof PutApiClientFormDtoV2 & keyof PutApiClientFormDtoV3) =>
    name as Path<D>;
  const errorMessage = (
    name: keyof PutApiClientFormDtoV2 & keyof PutApiClientFormDtoV3
  ): string | undefined =>
    (errors as Record<string, { message?: unknown } | undefined>)[name]?.message as
      | string
      | undefined;
  // Scoped accessors for the one field whose *name* diverges (odsInstanceId vs
  // dataStoreId). field()/errorMessage() cannot cover it: their parameter type
  // is keyof V2 & keyof V3 (the intersection), which excludes a renamed field.
  const odsField = () => props.odsFieldName as Path<D>;
  const odsErrorMessage = (): string | undefined =>
    (errors as Record<string, { message?: unknown } | undefined>)[props.odsFieldName]?.message as
      | string
      | undefined;

  const selectedOds = watch(odsField()) as number;
  const onSubmit = (data: D) => {
    // The one dynamic read of the diverging field. Routed through `unknown`
    // (like EditApplication.tsx's `defaultValues` write) because neither form
    // DTO has a string index signature, so a direct cast is rejected.
    const ids = [(data as unknown as Record<string, number>)[props.odsFieldName]];
    const payload = Object.assign(new PutDto(), {
      id: data.id,
      name: data.name,
      isApproved: data.isApproved,
      applicationId: data.applicationId,
      ...(props.odsFieldName === 'odsInstanceId' ? { odsInstanceIds: ids } : { dataStoreIds: ids }),
    });

    return putApiClient
      .mutateAsync(
        { entity: payload, pathParams: {} },
        {
          ...mutationErrCallback({ popGlobalBanner: popBanner, setFormError: setError }),
          onSuccess: goToView,
        }
      )
      .catch(noop);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormControl isInvalid={!!errors.name}>
        <FormLabel>Name</FormLabel>
        <Input {...register(field('name'))} />
        <FormErrorMessage>{errorMessage('name')}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!errors.isApproved}>
        <FormLabel>Enabled</FormLabel>
        <Switch
          {...register(field('isApproved'))}
          onChange={(e) => setValue(field('isApproved'), e.target.checked as never)}
        />
        <FormErrorMessage>{errorMessage('isApproved')}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!odsErrorMessage()}>
        <FormLabel>{odsTerminology.singular}</FormLabel>
        <SelectOds
          useInstanceId
          value={selectedOds}
          onChange={(value) => setValue(odsField(), value as never)}
        />
        <FormErrorMessage>{odsErrorMessage()}</FormErrorMessage>
      </FormControl>

      <FormControl>
        <FormLabel>Key</FormLabel>
        <Text>{apiClient.key}</Text>
      </FormControl>

      <ButtonGroup mt={4} colorScheme="primary">
        <Button isLoading={isSubmitting} type="submit">
          Save
        </Button>
        <Button variant="ghost" isLoading={isSubmitting} type="reset" onClick={goToView}>
          Cancel
        </Button>
      </ButtonGroup>
      {errors.root?.message ? (
        <Text mt={4} color="red.500">
          {errors.root?.message}
        </Text>
      ) : null}
    </form>
  );
}
