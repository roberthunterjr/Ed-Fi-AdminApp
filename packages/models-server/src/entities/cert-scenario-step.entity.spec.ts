import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { encryptedJsonTransformer } from '../utils/encrypted-json.transformer';
import { ScenarioStep } from './cert-scenario-step.entity';

const column = (propertyName: string) =>
  getMetadataArgsStorage().columns.find(
    (args) => args.target === ScenarioStep && args.propertyName === propertyName,
  );

describe('ScenarioStep', () => {
  // The snapshot holds a vendor's decrypted API response (AC-690).
  it('stores the response snapshot encrypted at rest', () => {
    expect(column('responseSnapshot')?.options.transformer).toBe(encryptedJsonTransformer);
  });

  it('keeps the response snapshot out of default selects, so step lists never load it', () => {
    expect(column('responseSnapshot')?.options.select).toBe(false);
  });

  it('keeps the response status nullable for runs that never sent the request', () => {
    expect(column('responseStatus')?.options.nullable).toBe(true);
  });
});
