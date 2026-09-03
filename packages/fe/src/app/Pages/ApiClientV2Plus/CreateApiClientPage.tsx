import {
  Button,
  ButtonGroup,
  chakra,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Switch,
  Text,
} from '@chakra-ui/react';
import { PageTemplate } from '@edanalytics/common-ui';
import {
  PostApiClientDtoV2,
  PostApiClientDtoV3,
  PostApiClientFormDtoV2,
  PostApiClientFormDtoV3,
} from '@edanalytics/models';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { MutateOptions, QueryKey, useQueryClient } from '@tanstack/react-query';
import { noop } from '@tanstack/react-table';
import { DefaultValues, Path, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { apiClientQueriesV2 } from '../../api/queries/queries.v7';
import {
  useNavToParent,
  useOdsTerminology,
  useTeamEdfiTenantNavContextLoaded,
} from '../../helpers';
import { SelectOds } from '../../helpers/EntitySelectors';
import { mutationErrCallback } from '../../helpers/mutationErrCallback';
import { usePopBanner } from '../../Layout/FeedbackBanner';
import { useApiClientConfig } from './apiClientConfig';

// Dispatches on the resolved version via `.match()` rather than destructuring
// `useApiClientConfig()` directly, so `CreateApiClientForm`'s generics are tied
// to the actual branch instead of the wider PostApiClientFormDtoV2 | V3 union
// (see the caveat comment in apiClientConfig.ts).
export const CreateApiClientPage = () =>
  useApiClientConfig.match({
    v2: (cfg) => (
      <CreateApiClientForm<PostApiClientFormDtoV2, PostApiClientDtoV2>
        config={cfg}
        odsFieldName="odsInstanceId"
      />
    ),
    v3: (cfg) => (
      <CreateApiClientForm<PostApiClientFormDtoV3, PostApiClientDtoV3>
        config={cfg}
        odsFieldName="dataStoreId"
      />
    ),
  });

// Two generics, unlike CreateApplicationForm's one: an api client's *form* DTO
// (`D`, one id) and its *wire* DTO (`W`, an id array) are different shapes, and
// both diverge between V2 and V3 — `PostApiClientDtoV2.odsInstanceIds` vs
// `PostApiClientDtoV3.dataStoreIds`. Pinning `W` to a single branch (or leaving
// it as the V2|V3 union) makes the other branch's `cfg` structurally
// unassignable to `config`, so the wire DTO gets its own parameter.
function CreateApiClientForm<
  D extends PostApiClientFormDtoV2 | PostApiClientFormDtoV3,
  W extends PostApiClientDtoV2 | PostApiClientDtoV3,
>(props: {
  // `post`'s entity/options are parameterized by this component's own W rather
  // than pinned to typeof apiClientQueriesV2.post: V2's and V3's post() differ
  // in both response DTO (PostApiClientResponseDtoV2 vs V3) and request entity
  // (PostApiClientDtoV2 vs V3), so a type fixed to one branch can't
  // structurally accept the other. `options` is typed via `MutateOptions` (the
  // same type `EntityQueryBuilder.post`'s `UseMutationResult['mutateAsync']`
  // uses under the hood, see builder.ts) parameterized by the same variables
  // object `mutateAsync`'s first argument uses, so `onSuccess`/`onError`
  // (including the mutationErrCallback(...) spread at the call site below) stay
  // checked without widening to `any`. `getAll` is narrowed to the one property
  // read from it (`queryKey`, for invalidation) because V2's and V3's return
  // `UseQueryOptions` over different Get DTOs.
  config: {
    queries: {
      post: (params: Parameters<typeof apiClientQueriesV2.post>[0]) => {
        mutateAsync: (
          args: { entity: W; pathParams: unknown },
          options?: MutateOptions<
            { id: number },
            unknown,
            { entity: W; pathParams: unknown },
            unknown
          >
        ) => Promise<{ id: number }>;
      };
      getAll: (...args: Parameters<typeof apiClientQueriesV2.getAll>) => { queryKey: QueryKey };
    };
    PostDto: new () => W;
    PostFormDto: new () => D;
  };
  odsFieldName: 'odsInstanceId' | 'dataStoreId';
}) {
  const { queries, PostDto, PostFormDto } = props.config;
  const { applicationId } = useParams() as { applicationId: string };
  const applicationIdNumber = Number(applicationId);
  const { teamId, edfiTenant, edfiTenantId } = useTeamEdfiTenantNavContextLoaded();
  const navToParentOptions = useNavToParent();
  const odsTerminology = useOdsTerminology();
  const popBanner = usePopBanner();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const resolver = classValidatorResolver(PostFormDto);

  const postApiClient = queries.post({
    edfiTenant,
    teamId,
  });

  const goToView = (id: number, options?: { state?: unknown }) => {
    navigate(
      `/as/${teamId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationIdNumber}/apiClients/${id}`,
      options
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
    // concretely PostApiClientFormDtoV2 or V3 at each call site, but this
    // function body is checked against the abstract D) — cast to the exact
    // param type useForm expects.
    defaultValues: {
      applicationId: applicationIdNumber,
      isApproved: true,
    } as DefaultValues<D>,
  });

  // Same generic-vs-abstract-D limitation as above, for register()/errors. The
  // parameter type is the field-name intersection of both branches (every field
  // here except odsFieldName is identical in name across V2/V3).
  const field = (name: keyof PostApiClientFormDtoV2 & keyof PostApiClientFormDtoV3) =>
    name as Path<D>;
  const errorMessage = (
    name: keyof PostApiClientFormDtoV2 & keyof PostApiClientFormDtoV3
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
    // (like CreateApplicationPage.tsx's `dataCopy` write) because neither form
    // DTO has a string index signature, so a direct cast is rejected.
    const ids = [(data as unknown as Record<string, number>)[props.odsFieldName]];
    const payload = Object.assign(new PostDto(), {
      name: data.name,
      isApproved: data.isApproved,
      applicationId: data.applicationId,
      ...(props.odsFieldName === 'odsInstanceId' ? { odsInstanceIds: ids } : { dataStoreIds: ids }),
    });

    return postApiClient
      .mutateAsync(
        { entity: payload, pathParams: {} },
        {
          ...mutationErrCallback({ popGlobalBanner: popBanner, setFormError: setError }),
          onSuccess: (result) => {
            void queryClient.invalidateQueries({
              queryKey: queries.getAll(
                {
                  teamId,
                  edfiTenant,
                },
                {
                  applicationId: applicationIdNumber,
                }
              ).queryKey,
            });

            if (typeof result.id === 'number') {
              goToView(result.id, { state: result });
              return;
            }

            navigate(navToParentOptions);
          },
        }
      )
      .catch(noop);
  };

  return (
    <PageTemplate title="New credentials">
      <chakra.form w="30em" onSubmit={handleSubmit(onSubmit)}>
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

        <ButtonGroup mt={4} colorScheme="primary">
          <Button isLoading={isSubmitting} type="submit">
            Save
          </Button>
          <Button
            variant="ghost"
            isLoading={isSubmitting}
            type="reset"
            onClick={() => {
              navigate(navToParentOptions);
            }}
          >
            Cancel
          </Button>
        </ButtonGroup>
        {errors.root?.message ? (
          <Text mt={4} color="red.500">
            {errors.root?.message}
          </Text>
        ) : null}
      </chakra.form>
    </PageTemplate>
  );
}
