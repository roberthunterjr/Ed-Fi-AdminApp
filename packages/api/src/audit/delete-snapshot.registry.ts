import type { EntityTarget, FindOneOptions } from 'typeorm';
import { toFindOptionsRelations } from './find-options-relations';

export type DeleteSnapshotOptions = {
  /** Relations to load alongside the entity so the builder can read them; dotted paths nest. */
  relations?: string[];
};

type Registration = {
  build: (target: never) => Record<string, unknown>;
  relations: string[];
};

const registry = new Map<unknown, Registration>();

/**
 * Registers an allowlist-based builder that turns an entity into the snapshot stored in the
 * audit details when that entity is deleted. Builders must pick fields explicitly.
 */
export const registerDeleteSnapshot = <T>(
  entity: EntityTarget<T>,
  toSnapshot: (target: T) => Record<string, unknown>,
  options: DeleteSnapshotOptions = {},
): void => {
  registry.set(entity, {
    build: toSnapshot as Registration['build'],
    relations: options.relations ?? [],
  });
};

export const getDeleteSnapshotBuilder = <T>(
  entity: EntityTarget<T>,
): ((target: T) => Record<string, unknown>) | undefined =>
  registry.get(entity)?.build as ((target: T) => Record<string, unknown>) | undefined;

export const getDeleteSnapshotRelations = (entity: EntityTarget<unknown>): string[] =>
  registry.get(entity)?.relations ?? [];

/** The findOne options that load one entity plus the relations its snapshot builder reads. */
export const getDeleteSnapshotFindOptions = (
  entity: EntityTarget<unknown>,
  primaryKey: string,
  id: number,
): FindOneOptions => ({
  where: { [primaryKey]: id },
  relations: toFindOptionsRelations(getDeleteSnapshotRelations(entity)),
});
