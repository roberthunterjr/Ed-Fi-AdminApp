import 'reflect-metadata';
import { validate } from 'class-validator';
import { MAX_ODS_NAME_LENGTH, MAX_PORTABLE_DATABASE_NAME_LENGTH } from '../utils';
import {
  PostInstanceDtoV2,
  CopyClaimsetDtoV2,
  ImportClaimsetSingleDtoV2,
  PostApiClientFormDtoV2,
  PutApiClientFormDtoV2,
} from './edfi-admin-api.v2.dto';

describe('PostInstanceDtoV2', () => {
  it('requires name and databaseTemplate', async () => {
    const dto = new PostInstanceDtoV2();
    const result = await validate(dto);
    const fieldsWithErrors = result.map((error) => error.property);

    expect(fieldsWithErrors).toContain('name');
    expect(fieldsWithErrors).toContain('databaseTemplate');
  });

  it('accepts name and databaseTemplate', async () => {
    const dto = Object.assign(new PostInstanceDtoV2(), {
      name: 'My DB Instance',
      databaseTemplate: 'Minimal',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a name at the maximum length', async () => {
    const dto = Object.assign(new PostInstanceDtoV2(), {
      name: 'a'.repeat(MAX_ODS_NAME_LENGTH),
      databaseTemplate: 'Minimal',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a name one character over the maximum length', async () => {
    const dto = Object.assign(new PostInstanceDtoV2(), {
      name: 'a'.repeat(MAX_ODS_NAME_LENGTH + 1),
      databaseTemplate: 'Minimal',
    });

    expect((await validate(dto)).map((e) => e.property)).toContain('name');
  });

  it('rejects a non-ASCII name, keeping the character cap a byte cap', async () => {
    // 46 characters passes MaxLength, but is ~138 bytes in UTF-8 — over the portable
    // limit the cap exists to protect. The character-set rule is what closes that.
    const name = '数'.repeat(MAX_ODS_NAME_LENGTH);
    const dto = Object.assign(new PostInstanceDtoV2(), { name, databaseTemplate: 'Minimal' });

    expect(name).toHaveLength(MAX_ODS_NAME_LENGTH);
    expect(Buffer.byteLength(name, 'utf8')).toBeGreaterThan(MAX_PORTABLE_DATABASE_NAME_LENGTH);
    expect((await validate(dto)).map((e) => e.property)).toContain('name');
  });

  it('rejects a name with unsupported punctuation', async () => {
    const dto = Object.assign(new PostInstanceDtoV2(), {
      name: 'Instance-One',
      databaseTemplate: 'Minimal',
    });

    expect((await validate(dto)).map((e) => e.property)).toContain('name');
  });
});

describe('V2 claim set name validation', () => {
  const namesOf = async (dto: object) => (await validate(dto)).map((e) => e.property);

  it('CopyClaimsetDtoV2 still ACCEPTS whitespace (V2 has no such rule)', async () => {
    const dto = Object.assign(new CopyClaimsetDtoV2(), {
      originalId: 1,
      name: 'AB Connect (copy)',
    });
    expect(await namesOf(dto)).not.toContain('name');
  });

  it('ImportClaimsetSingleDtoV2 still ACCEPTS whitespace', async () => {
    const dto = Object.assign(new ImportClaimsetSingleDtoV2(), {
      name: 'Bootstrap Descriptors and EdOrgs',
      resourceClaims: [],
    });
    expect(await namesOf(dto)).not.toContain('name');
  });

  it('CopyClaimsetDtoV2 rejects a name of 300 characters', async () => {
    const dto = Object.assign(new CopyClaimsetDtoV2(), {
      originalId: 1,
      name: 'A'.repeat(300),
    });
    expect(await namesOf(dto)).toContain('name');
  });

  it('ImportClaimsetSingleDtoV2 rejects a name of 300 characters', async () => {
    const dto = Object.assign(new ImportClaimsetSingleDtoV2(), {
      name: 'A'.repeat(300),
      resourceClaims: [],
    });
    expect(await namesOf(dto)).toContain('name');
  });
});

describe('ApiClient form DTOs V2 (shape preserved after extracting the base)', () => {
  it('PostApiClientFormDtoV2 validates all four fields', async () => {
    const errs = await validate(new PostApiClientFormDtoV2());
    expect(errs.map((e) => e.property).sort()).toEqual(
      ['applicationId', 'isApproved', 'name', 'odsInstanceId']
    );
  });

  it('PutApiClientFormDtoV2 validates all five fields, including id', async () => {
    const errs = await validate(new PutApiClientFormDtoV2());
    expect(errs.map((e) => e.property).sort()).toEqual(
      ['applicationId', 'id', 'isApproved', 'name', 'odsInstanceId']
    );
  });

  it('keeps the name length rule from the base', async () => {
    const dto = Object.assign(new PostApiClientFormDtoV2(), {
      name: 'ab', isApproved: true, applicationId: 1, odsInstanceId: 1,
    });
    expect((await validate(dto)).map((e) => e.property)).toContain('name');
  });

  it('has no V3 field', async () => {
    const errs = await validate(new PostApiClientFormDtoV2());
    expect(errs.map((e) => e.property)).not.toContain('dataStoreId');
  });
});
