/** Shared TypeORM `relations` shapes for SbEnvironment/EdfiTenant reads, so the nesting stays consistent across call sites. */
export const EDFI_TENANT_ODSS_EDORGS_RELATIONS = { odss: { edorgs: true } } as const;

export const SB_ENVIRONMENT_EDFI_TENANTS_RELATIONS = {
  edfiTenants: EDFI_TENANT_ODSS_EDORGS_RELATIONS,
} as const;
