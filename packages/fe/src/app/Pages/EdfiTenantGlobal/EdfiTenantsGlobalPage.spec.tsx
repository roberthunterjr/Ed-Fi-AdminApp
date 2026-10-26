// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import 'reflect-metadata';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { GetEdfiTenantDto } from '@edanalytics/models';
import { EdfiTenantsNameCell } from './EdfiTenantsGlobalPage';

jest.mock('@chakra-ui/react', () => ({
  HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@edanalytics/common-ui', () => ({
  PageActions: () => null,
  PageTemplate: ({ children }: { children: React.ReactNode }) => children,
  SbaaTableAllInOne: () => null,
  TableRowActions: () => null,
  ValueAsDate: jest.fn(() => () => null),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../api', () => ({
  edfiTenantQueriesGlobal: { getAll: jest.fn() },
  userQueries: { getAll: jest.fn() },
}));

jest.mock('../../helpers', () => ({
  useSbEnvironmentNavContext: jest.fn(),
  withLoader: (component: unknown) => component,
}));

jest.mock('../../helpers/getRelationDisplayName', () => ({
  getRelationDisplayName: jest.fn(),
}));

// Faithful stand-in for the real link: it resolves the tenant out of the query
// map it is given and falls back to the "can't find" text on a miss.
jest.mock('../../routes', () => ({
  UserGlobalLink: () => null,
  EdfiTenantGlobalLink: ({
    id,
    query,
  }: {
    id: number;
    query: { data?: Record<number, { displayName: string }> };
  }) => {
    const tenant = query.data?.[id];
    return tenant ? <span>{tenant.displayName}</span> : <span>can't find “{id}”</span>;
  },
}));

jest.mock('./useEdfiTenantGlobalActions', () => ({
  useEdfiTenantGlobalActions: jest.fn(() => ({})),
}));

jest.mock('./useEdfiTenantsGlobalActions', () => ({
  useEdfiTenantsGlobalActions: jest.fn(() => ({})),
}));

const makeCellContext = (tenant: Partial<GetEdfiTenantDto>) =>
  ({ row: { original: tenant } } as unknown as Parameters<typeof EdfiTenantsNameCell>[0]);

describe('EdfiTenantsNameCell', () => {
  it('renders the tenant link from the row itself', () => {
    render(<EdfiTenantsNameCell {...makeCellContext({ id: 7, displayName: 'Tenant Seven' })} />);

    expect(screen.getByText('Tenant Seven')).toBeInTheDocument();
    expect(screen.queryByText(/can't find/)).not.toBeInTheDocument();
  });

  it('keeps resolving the link when the row changes after a refetch', () => {
    const { rerender } = render(
      <EdfiTenantsNameCell {...makeCellContext({ id: 1, displayName: 'Old Tenant' })} />
    );
    expect(screen.getByText('Old Tenant')).toBeInTheDocument();

    rerender(<EdfiTenantsNameCell {...makeCellContext({ id: 2, displayName: 'New Tenant' })} />);

    expect(screen.getByText('New Tenant')).toBeInTheDocument();
    expect(screen.queryByText(/can't find/)).not.toBeInTheDocument();
  });
});
